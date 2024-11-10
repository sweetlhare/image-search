from PIL import Image
import torch
from typing import List, Dict, Tuple, Union
import base64
import io
import logging

logger = logging.getLogger(__name__)

def process_vision_info(messages: List[Dict]) -> Tuple[List[Union[str, Image.Image]], List[List[Image.Image]]]:
    """Process vision information from messages"""
    images = []
    videos = []
    
    try:
        for message in messages:
            if not isinstance(message, dict) or 'content' not in message:
                continue
                
            content = message['content']
            if not isinstance(content, list):
                content = [content]
                
            for item in content:
                if not isinstance(item, dict) or 'type' not in item:
                    continue
                    
                if item['type'] == 'image':
                    image_path = item.get('image')
                    if image_path:
                        try:
                            logger.debug(f"Processing image from: {type(image_path)}")
                            
                            if isinstance(image_path, str):
                                if image_path.startswith('data:image'):
                                    base64_data = image_path.split(',')[1]
                                    image_data = base64.b64decode(base64_data)
                                    image = Image.open(io.BytesIO(image_data))
                                else:
                                    image = Image.open(image_path)
                            elif isinstance(image_path, bytes):
                                image = Image.open(io.BytesIO(image_path))
                            else:
                                image = image_path
                                
                            if image.mode != 'RGB':
                                image = image.convert('RGB')
                                
                            # Resize if needed
                            max_pixels = item.get('max_pixels', 360 * 420)
                            current_pixels = image.size[0] * image.size[1]
                            if current_pixels > max_pixels:
                                ratio = (max_pixels / current_pixels) ** 0.5
                                new_size = tuple(int(dim * ratio) for dim in image.size)
                                image = image.resize(new_size, Image.Resampling.LANCZOS)
                                
                            images.append(image)
                            # Добавляем пустой список кадров для видео
                            videos.append([[image]])
                            logger.debug(f"Successfully processed image: {image.size}")
                            
                        except Exception as e:
                            logger.error(f"Error processing image: {str(e)}")
                            continue
    except Exception as e:
        logger.error(f"Error in process_vision_info: {str(e)}")
    
    # Убедимся, что у нас есть хотя бы один элемент
    if not images:
        logger.warning("No images processed, returning default empty list")
        images = [None]
        videos = [[None]]
    
    return images, videos