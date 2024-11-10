from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
from vision_process import process_vision_info
from pydantic import BaseModel
from typing import Dict, Optional, List
from collections import Counter
from annoy import AnnoyIndex
import numpy as np
import logging
import traceback
import pickle
import base64
import math
import io
import os

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class ImagePreview(BaseModel):
    image_path: str
    preview_path: str
    category: str
    similarity: float
    distance: float

class PredictionResult(BaseModel):
    image_path: str
    recs: str
    model_used: str
    confidence_score: float
    top_matches: List[ImagePreview]
    category: str
    closest_distance: float
    category_count: int

class ImageSearchEngine:
    def __init__(self):
        self.encoder = None
        self.annoy_index = None
        self.qwen_model = None
        self.qwen_processor = None
        self.embeddings_dict = {}
        self.file_mapping = {}
        self.class_mapping = {}
        self.embedding_dim = None
        
    def load_search_data(self, data_dir="./data"):
        """Load search index and mappings"""
        try:
            # Load processed data
            with open(f"{data_dir}/processed_data.pkl", "rb") as f:
                data = pickle.load(f)
                self.embeddings_dict = data['embeddings']
                self.file_mapping = data['file_mapping']
                self.class_mapping = data['class_mapping']
            
            # Initialize Annoy index
            first_embedding = next(iter(self.embeddings_dict.values()))
            self.embedding_dim = len(first_embedding)
            self.annoy_index = AnnoyIndex(self.embedding_dim, 'angular')
            self.annoy_index.load(f"{data_dir}/image_index.ann")
            
            return True
        except Exception as e:
            logger.error(f"Error loading search data: {str(e)}")
            return False

    def get_image_preview(self, image_path: str, size=(150, 150)) -> Optional[str]:
        """Create thumbnail and return base64 encoded image"""
        try:
            with Image.open(f"dataset/{image_path}.jpg") as img:
                img.thumbnail(size)
                buffered = io.BytesIO()
                img.save(buffered, format="JPEG")
                img_str = base64.b64encode(buffered.getvalue()).decode()
                return f"data:image/jpeg;base64,{img_str}"
        except Exception as e:
            logger.error(f"Error creating preview for {image_path}: {e}")
            return None

    def find_similar_images(self, embedding, n_candidates=30) -> tuple:
        """Get similar images using Annoy index"""
        similar_idx, distances = self.annoy_index.get_nns_by_vector(
            embedding, n_candidates, include_distances=True
        )
        similarities = [1 - (dist * 2 / math.pi) for dist in distances]
        
        candidates = [
            (idx, self.class_mapping[idx], sim) 
            for idx, sim in zip(similar_idx, similarities)
        ]
        
        return candidates, similarities

    def select_recommendations(self, candidates, similarities) -> tuple:
        """Select top 10 recommendations using improved strategy"""
        # Get category distribution in top 10
        top_10_categories = [cat for _, cat, _ in candidates[:10]]
        category_counts = Counter(top_10_categories)
        
        majority_category, majority_count = category_counts.most_common(1)[0] if category_counts else (None, 0)
        
        # Initialize result variables
        result_category = None
        selected_recommendations = []
        confidence_score = similarities[0] if similarities else 0
        
        # Strategy selection based on similarity and category pattern
        if similarities and similarities[0] > 0.7:
            # Very close visual match - use same category
            result_category = candidates[0][1]
            confidence_score = similarities[0]
            selected_recommendations = self._get_category_recommendations(
                candidates, result_category, limit=10
            )
            
        elif majority_count > 7:
            # Strong category pattern - use majority category
            result_category = majority_category
            selected_recommendations = self._get_category_recommendations(
                candidates, majority_category, limit=10
            )
            
            # Adjust confidence based on category matches
            category_similarities = [
                sim for _, cat, sim in candidates[:10] 
                if cat == majority_category
            ]
            confidence_score = np.mean(category_similarities) if category_similarities else similarities[0]
            
        else:
            # Mixed case - use top matches regardless of category
            result_category = candidates[0][1]
            confidence_score = similarities[0]
            selected_recommendations = [
                self.file_mapping[idx] for idx, _, _ in candidates[:10]
            ]
        
        # Ensure we have exactly 10 recommendations
        if len(selected_recommendations) < 10:
            selected_recommendations = self._pad_recommendations(
                selected_recommendations, result_category, 
                majority_count > 7 or similarities[0] > 0.7
            )
            
        return (
            selected_recommendations[:10], 
            result_category,
            confidence_score,
            1 - similarities[0] if similarities else 1.0,
            majority_count
        )

    def _get_category_recommendations(self, candidates, category, limit=10):
        """Get recommendations from specific category"""
        recommendations = []
        
        # First, get matches from candidates
        for idx, cat, _ in candidates:
            if cat == category and len(recommendations) < limit:
                recommendations.append(self.file_mapping[idx])
                
        # If needed, add more from the same category
        if len(recommendations) < limit:
            for idx, cat in self.class_mapping.items():
                if len(recommendations) >= limit:
                    break
                if cat == category and self.file_mapping[idx] not in recommendations:
                    recommendations.append(self.file_mapping[idx])
                    
        return recommendations

    def _pad_recommendations(self, recommendations, category, use_category_padding=True):
        """Pad recommendations to ensure exactly 10 items"""
        if use_category_padding:
            # Add more from same category
            additional = set()
            for idx, cat in self.class_mapping.items():
                if len(recommendations) + len(additional) >= 10:
                    break
                if cat == category and self.file_mapping[idx] not in recommendations:
                    additional.add(self.file_mapping[idx])
            recommendations.extend(list(additional))
            
        # If still not enough, duplicate last item
        while len(recommendations) < 10:
            recommendations.append(
                recommendations[-1] if recommendations else "placeholder"
            )
            
        return recommendations

    def create_preview_candidates(self, candidates, result_category, 
                                majority_count, similarity_threshold=0.7):
        """Create preview candidates for top matches"""
        preview_candidates = (
            [(idx, cat, sim) for idx, cat, sim in candidates[:3] 
             if cat == result_category]
            if (majority_count > 7 or candidates[0][2] > similarity_threshold)
            else candidates[:3]
        )
        
        top_previews = []
        for idx, cat, sim in preview_candidates:
            preview = self.get_image_preview(self.file_mapping[idx])
            if preview:
                top_previews.append(ImagePreview(
                    image_path=self.file_mapping[idx],
                    preview_path=preview,
                    category=cat,
                    similarity=float(sim),
                    distance=float(1 - sim)
                ))
                
        return top_previews

# Initialize FastAPI app and search engine
app = FastAPI()
search_engine = ImageSearchEngine()

# Configure CORS and static files
app.mount("/dataset", StaticFiles(directory="dataset"), name="dataset")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize search engine on startup"""
    try:
        logger.info("Starting initialization...")
        
        # Initialize ConvNeXT
        from convnext_init import ImageEncoder
        search_engine.encoder = ImageEncoder()
        
        # Load search data
        if not search_engine.load_search_data():
            raise Exception("Failed to load search data")
        
        # Initialize Qwen
        search_engine.qwen_model = Qwen2VLForConditionalGeneration.from_pretrained(
            "Qwen/Qwen2-VL-2B-Instruct",
        ).to('cpu')
        search_engine.qwen_processor = AutoProcessor.from_pretrained(
            "Qwen/Qwen2-VL-2B-Instruct"
        )
        
        logger.info("Initialization completed successfully")
    except Exception as e:
        logger.error(f"Error in startup: {str(e)}")
        logger.error(traceback.format_exc())

# @app.post("/predict", response_model=PredictionResult)
# async def predict(file: UploadFile = File(...)):
#     """Endpoint for image search predictions"""
#     try:
#         if not file.content_type.startswith("image/"):
#             raise HTTPException(status_code=400, detail="File must be an image")

#         # Process uploaded image
#         contents = await file.read()
#         image = Image.open(io.BytesIO(contents))
        
#         temp_path = "temp_image.jpg"
#         image.save(temp_path)
        
#         try:
#             # Get image embedding
#             embedding = search_engine.encoder.get_embedding(temp_path)
            
#             if embedding is None:
#                 raise HTTPException(status_code=500, detail="Failed to get embedding")
                
#             # Find similar images
#             candidates, similarities = search_engine.find_similar_images(embedding)
            
#             # Select recommendations
#             (recommendations, category, confidence_score, 
#              closest_distance, majority_count) = search_engine.select_recommendations(
#                 candidates, similarities
#             )
            
#             # Create previews
#             top_previews = search_engine.create_preview_candidates(
#                 candidates, category, majority_count
#             )
            
#             return PredictionResult(
#                 image_path=file.filename,
#                 recs=",".join(recommendations),
#                 model_used='convnext',
#                 confidence_score=float(confidence_score),
#                 top_matches=top_previews,
#                 category=category,
#                 closest_distance=float(closest_distance),
#                 category_count=majority_count
#             )
            
#         finally:
#             if os.path.exists(temp_path):
#                 os.remove(temp_path)
                
#     except Exception as e:
#         logger.error(f"Error processing request: {str(e)}")
#         logger.error(traceback.format_exc())
#         raise HTTPException(status_code=500, detail=str(e))
        
@app.post("/predict", response_model=PredictionResult)
async def predict(file: UploadFile = File(...)):
    """Endpoint for raw image search predictions without post-processing"""
    try:
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Process uploaded image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        temp_path = "temp_image.jpg"
        image.save(temp_path)
        
        try:
            # Get image embedding
            embedding = search_engine.encoder.get_embedding(temp_path)
            
            if embedding is None:
                raise HTTPException(status_code=500, detail="Failed to get embedding")
                
            # Get raw search results (top 10)
            similar_idx, distances = search_engine.annoy_index.get_nns_by_vector(
                embedding, 10, include_distances=True
            )
            
            # Convert distances to similarities
            similarities = [1 - (dist * 2 / math.pi) for dist in distances]
            
            # Get recommendations and categories
            recommendations = [search_engine.file_mapping[idx] for idx in similar_idx]
            categories = [search_engine.class_mapping[idx] for idx in similar_idx]
            
            # Create preview info for top 3
            top_previews = []
            for idx, sim, cat in list(zip(similar_idx, similarities, categories))[:3]:
                preview = search_engine.get_image_preview(search_engine.file_mapping[idx])
                if preview:
                    top_previews.append(ImagePreview(
                        image_path=search_engine.file_mapping[idx],
                        preview_path=preview,
                        category=cat,
                        similarity=float(sim),
                        distance=float(1 - sim)
                    ))
            
            return PredictionResult(
                image_path=file.filename,
                recs=",".join(recommendations),
                model_used='convnext',
                confidence_score=float(similarities[0]) if similarities else 0.0,
                top_matches=top_previews,
                category=categories[0] if categories else "",
                closest_distance=float(distances[0]) if distances else 1.0,
                category_count=len(set(categories))
            )
            
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status")
async def get_status():
    """Get service status"""
    return {
        "convnext_ready": search_engine.encoder is not None and search_engine.annoy_index is not None,
        "qwen_ready": search_engine.qwen_model is not None and search_engine.qwen_processor is not None,
        "index_size": len(search_engine.file_mapping) if search_engine.file_mapping else 0,
        "embedding_dim": search_engine.embedding_dim,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)