import torch
import torch.nn as nn
from torchvision import models, transforms
from pathlib import Path
import numpy as np
from annoy import AnnoyIndex
import pickle
import os
from PIL import Image
import logging
from tqdm import tqdm
from collections import defaultdict

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class ImageEncoder:
    def __init__(self):
        logger.info("Loading ConvNeXT model...")
        self.model = models.convnext_large(pretrained=True)
        self.model = nn.Sequential(*list(self.model.children())[:-1])
        self.model.eval()
        
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = self.model.to(self.device)
        
        self.transform = transforms.Compose([
            transforms.Resize(236, interpolation=transforms.InterpolationMode.BICUBIC),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], 
                             std=[0.229, 0.224, 0.225])
        ])
        logger.info(f"Model loaded successfully on {self.device}!")

    def get_embedding(self, image_path):
        try:
            image = Image.open(image_path).convert('RGB')
            image = self.transform(image).unsqueeze(0)
            image = image.to(self.device)
            
            with torch.no_grad():
                embedding = self.model(image)
                
            embedding = embedding.squeeze().cpu().numpy()
            embedding = embedding / np.linalg.norm(embedding)
            return embedding
        except Exception as e:
            logger.error(f"Error processing {image_path}: {str(e)}")
            return None

def process_dataset(dataset_path, encoder, save_dir="./data"):
    """Process dataset and create index"""
    dataset_path = Path(dataset_path)
    
    embeddings_dict = {}
    file_mapping = {}
    class_mapping = {}
    reverse_class_mapping = {}
    class_stats = defaultdict(int)
    
    os.makedirs(save_dir, exist_ok=True)
    
    idx = 0
    logger.info("Processing dataset...")
    
    for class_dir in tqdm(list(dataset_path.iterdir())):
        if class_dir.is_dir():
            class_name = class_dir.name
            for image_file in class_dir.glob("*.*"):
                if image_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                    embedding = encoder.get_embedding(str(image_file))
                    if embedding is not None:
                        embeddings_dict[idx] = embedding
                        file_mapping[idx] = image_file.stem
                        class_mapping[idx] = class_name
                        reverse_class_mapping[image_file.stem] = class_name
                        class_stats[class_name] += 1
                        idx += 1
    
    logger.info(f"\nTotal images processed: {idx}")
    logger.info("\nClass distribution:")
    for class_name, count in class_stats.items():
        logger.info(f"{class_name}: {count} images")
    
    # Save processed data
    processed_data_path = f"{save_dir}/processed_data.pkl"
    with open(processed_data_path, "wb") as f:
        pickle.dump({
            'embeddings': embeddings_dict,
            'file_mapping': file_mapping,
            'class_mapping': class_mapping,
            'reverse_class_mapping': reverse_class_mapping,
            'class_stats': dict(class_stats)
        }, f)
    
    # Build and save index
    logger.info("Building Annoy index...")
    first_embedding = next(iter(embeddings_dict.values()))
    embedding_dim = len(first_embedding)
    index = AnnoyIndex(embedding_dim, 'angular')
    
    for idx, embedding in embeddings_dict.items():
        index.add_item(idx, embedding)
    
    logger.info("Building index with 100 trees...")
    index.build(100)
    index.save(f"{save_dir}/image_index.ann")
    
    logger.info("Index saved successfully")
    
    return embeddings_dict, file_mapping, class_mapping, reverse_class_mapping, index

if __name__ == "__main__":
    encoder = ImageEncoder()
    process_dataset("dataset", encoder)
