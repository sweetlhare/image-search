import React, { useState, useEffect } from 'react';
import { Upload, Send, ImagePlus, Loader2, Settings, BarChart2, X, Info, ChevronRight, ChevronLeft, FileDown } from 'lucide-react';

const ImageClassifier = () => {

  const [successfulPredictions, setSuccessfulPredictions] = useState([]);

  // File handling states
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  // Settings states
  const [showSettings, setShowSettings] = useState(false);
  const [useQwen, setUseQwen] = useState(true);
  const [distanceThreshold, setDistanceThreshold] = useState(0.3);
  const [categoryThreshold, setCategoryThreshold] = useState(6);

  // UI states
  const [showStats, setShowStats] = useState(false);
  const [statsUrl, setStatsUrl] = useState(null);
  
  // Image preview states
  const [selectedImage, setSelectedImage] = useState(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [similarImages, setSimilarImages] = useState([]);

  // Basic handlers
  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const openImageViewer = (prediction, initialIndex = 0) => {
    setSelectedImage(prediction);
    setCurrentImageIndex(initialIndex);
    setSimilarImages(prediction.top_matches || []);
    setShowImageViewer(true);
  };

  const closeImageViewer = () => {
    setShowImageViewer(false);
    setSelectedImage(null);
    setCurrentImageIndex(0);
    setSimilarImages([]);
  };

  const navigateImage = (direction) => {
    setCurrentImageIndex((prev) => {
      const newIndex = prev + direction;
      if (newIndex < 0) return similarImages.length - 1;
      if (newIndex >= similarImages.length) return 0;
      return newIndex;
    });
  };

  // Modal component
  const Modal = ({ show, onClose, title, children, maxWidth = "max-w-2xl" }) => {
    if (!show) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`bg-white rounded-lg p-6 w-full mx-4 ${maxWidth}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">{title}</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  };

  // Function to handle image loading errors
  const handleImageError = (imageUrl) => {
    console.warn(`Failed to load image: ${imageUrl}`);
    return false;
  };

  // Modified processImages function with error handling and auto-download
  const processImages = async () => {
    setIsProcessing(true);
    setPredictions([]);
    setSuccessfulPredictions([]);
    
    try {
      const processedPredictions = [];
      
      for (let i = 0; i < selectedFiles.length; i++) {
        setProcessingStatus(`Processing image ${i + 1} of ${selectedFiles.length}`);
        
        const formData = new FormData();
        formData.append('file', selectedFiles[i]);
        
        try {
          const response = await fetch(
            `http://localhost:8080/predict?use_qwen=${useQwen}`, 
            {
              method: 'POST',
              body: formData,
            }
          );
          
          const data = await response.json();
          
          if (response.ok) {
            const prediction = {
              name: selectedFiles[i].name,
              ...data,
              preview: URL.createObjectURL(selectedFiles[i])
            };
            
            // Check if we can load the image
            const imageLoaded = await new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve(true);
              img.onerror = () => resolve(false);
              img.src = prediction.preview;
            });

            if (imageLoaded) {
              processedPredictions.push(prediction);
              if (showResults) {
                setPredictions(prev => [...prev, prediction]);
              }
              setSuccessfulPredictions(prev => [...prev, prediction]);
            } else {
              console.warn(`Skipping ${selectedFiles[i].name} due to image loading error`);
            }
          }
        } catch (error) {
          console.error(`Error processing ${selectedFiles[i].name}:`, error);
        }
      }

      // Automatically download submission.csv after processing
      if (processedPredictions.length > 0) {
        downloadSubmissionCSV(processedPredictions);
      }
      
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      setStatsUrl(`http://localhost:8080/statistics?t=${Date.now()}`);
    }
  };


  const downloadCSV = () => {
    if (predictions.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "image,category,model_used,confidence_score,closest_distance,category_count\n";
    
    predictions.forEach(pred => {
      csvContent += `${pred.image_path},${pred.category},${pred.model_used},${pred.confidence_score},${pred.closest_distance},${pred.category_count}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "image_search_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Modified downloadSubmissionCSV function
  const downloadSubmissionCSV = (predictionsData = predictions) => {
    if (predictionsData.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "image,recs\n";
    
    predictionsData.forEach(pred => {
      // Get recommendations and ensure we have exactly 10 items
      const recs = pred.recs ? pred.recs.split(',') : [];
      while (recs.length < 10) {
        recs.push(recs[recs.length - 1] || 'placeholder');
      }
      const finalRecs = recs.slice(0, 10).map(rec => rec.trim());
      
      // Remove file extensions from image names
      const imageName = pred.name.replace(/\.[^/.]+$/, "");
      
      csvContent += `${imageName},"${finalRecs.join(',')}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "submission.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getModelBadgeColor = (model) => {
    switch(model) {
      case 'convnext':
        return 'bg-blue-100 text-blue-800';
      case 'qwen':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const DecisionIndicator = ({ distance, threshold, count }) => {
    const getDecisionText = () => {
      if (distance < threshold) {
        return "Visual Match (ConvNext)";
      } else if (count >= categoryThreshold) {
        return `Category Pattern Match (${count}/10)`;
      } else {
        return "AI Text Analysis (Qwen)";
      }
    };
  
    const getDecisionColor = () => {
      if (distance < threshold) return "bg-green-100 text-green-800";
      if (count >= categoryThreshold) return "bg-blue-100 text-blue-800";
      return "bg-purple-100 text-purple-800";
    };
  
    const getConfidenceText = () => {
      const similarity = (1 - distance) * 100;
      if (distance < threshold) {
        return `${similarity.toFixed(1)}% visual similarity`;
      } else if (count >= categoryThreshold) {
        return `${count * 10}% pattern consistency`;
      }
      return "AI semantic analysis";
    };
  
    return (
      <div className="space-y-1">
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${getDecisionColor()}`}>
          {getDecisionText()}
        </div>
        <div className="text-xs text-gray-500 text-center">
          {getConfidenceText()}
        </div>
      </div>
    );
  };

  // Утилита для работы с URL изображений
  const ImageUrlUtils = {
    getDatasetImageUrl: (filename, category) => {
      // Очищаем имя файла от расширения если оно есть
      const cleanFilename = filename.replace(/\.[^/.]+$/, "");
      return `http://127.0.0.1:8081/backend/dataset/${category}/${cleanFilename}.jpg`;
    },
  };
    
  // Modified ImageViewer component with error handling
  const ImageViewer = ({ show, onClose }) => {
    if (!show || !selectedImage) return null;

    const allImages = [
      {
        preview_path: selectedImage.preview,
        category: selectedImage.category || '',
        similarity: 1.0,
        name: selectedImage.name,
        isOriginal: true
      }
    ];

    if (selectedImage.recs) {
      const recImages = selectedImage.recs.split(',')
        .map((rec, idx) => {
          const imageUrl = `http://127.0.0.1:8081/backend/dataset/${selectedImage.category}/${rec}.jpg`;
          return {
            image_path: rec,
            preview_path: imageUrl,
            category: selectedImage.top_matches?.[idx]?.category || '',
            similarity: selectedImage.top_matches?.[idx]?.similarity || 0,
            name: rec,
            isOriginal: false
          };
        });
      allImages.push(...recImages);
    }

    const currentImage = allImages[currentImageIndex] || allImages[0];

  
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-black bg-opacity-50">
          <div className="text-white">
            <h3 className="text-lg font-semibold">
              {currentImage.isOriginal ? 'Original Image' : 'Similar Image'}
            </h3>
            <p className="text-sm opacity-80">
              {currentImage.name}
            </p>
            {currentImage.category && (
              <p className="text-sm opacity-80">
                Category: {currentImage.category}
                {!currentImage.isOriginal && currentImage.similarity && 
                  ` (${(currentImage.similarity * 100).toFixed(1)}% match)`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
  
        {/* Main content */}
        <div className="flex-1 flex items-center justify-center relative">
          {allImages.length > 1 && (
            <>
              <button 
                onClick={() => navigateImage(-1)}
                className="absolute left-4 text-white p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              
              <button 
                onClick={() => navigateImage(1)}
                className="absolute right-4 text-white p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </>
          )}
  
          <img
            src={currentImage.isOriginal ? currentImage.preview_path : currentImage.preview_path}
            alt={currentImage.name}
            className="max-h-[80vh] max-w-[90vw] object-contain"
            onError={(e) => {
              console.error('Error loading image:', currentImage.preview_path);
              e.target.src = selectedImage.preview;
            }}
          />
        </div>
  
        {/* Thumbnails */}
        <div className="p-4 bg-black bg-opacity-50">
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {allImages.map((image, index) => (
              <div
              key={index}
              onClick={() => setCurrentImageIndex(index)}
              className={`flex-shrink-0 cursor-pointer transition-all ${
                currentImageIndex === index ? 'ring-2 ring-blue-500' : ''
              }`}
            >
                <img
                  src={image.isOriginal ? image.preview_path : image.preview_path}
                  alt={image.name}
                  className="h-20 w-20 object-cover rounded"
                  onError={(e) => {
                    console.error('Error loading thumbnail:', image.preview_path);
                    e.target.src = selectedImage.preview;
                  }}
                />
                <div className="text-white text-xs mt-1 text-center">
                  <div className="truncate max-w-[80px]">
                    {image.isOriginal ? 'Original' : image.name}
                  </div>
                  {!image.isOriginal && image.similarity && (
                    <div>{(image.similarity * 100).toFixed(1)}%</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Обновлённый компонент для отображения карточек результатов
  // First define the ResultCard component
const ResultCard = ({ pred, openImageViewer }) => {
  // Helper function to construct the correct image URL
  const getImageUrl = (imagePath) => {
    // Split the path to get category and filename
    const parts = imagePath.split('/');
    if (parts.length === 1) {
      // If no category in path, assume it's just a filename
      return `http://127.0.0.1:8081/backend/dataset/${pred.category}/${imagePath}.jpg`;
    }
    // If path already contains category
    return `http://127.0.0.1:8081/backend/dataset/${imagePath}.jpg`;
  };

  const getModelBadgeColor = (model) => {
    switch(model) {
      case 'convnext':
        return 'bg-blue-100 text-blue-800';
      case 'qwen':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const DecisionIndicator = ({ distance, threshold, count }) => {
    const getDecisionText = () => {
      if (distance < threshold) {
        return "Visual Match (ConvNext)";
      } else if (count >= categoryThreshold) {
        return `Category Pattern Match (${count}/10)`;
      } else {
        return "AI Text Analysis (Qwen)";
      }
    };

    const getDecisionColor = () => {
      if (distance < threshold) return "bg-green-100 text-green-800";
      if (count >= categoryThreshold) return "bg-blue-100 text-blue-800";
      return "bg-purple-100 text-purple-800";
    };

    const getConfidenceText = () => {
      const similarity = (1 - distance) * 100;
      if (distance < threshold) {
        return `${similarity.toFixed(1)}% visual similarity`;
      } else if (count >= categoryThreshold) {
        return `${count * 10}% pattern consistency`;
      }
      return "AI semantic analysis";
    };

    return (
      <div className="space-y-1">
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${getDecisionColor()}`}>
          {getDecisionText()}
        </div>
        <div className="text-xs text-gray-500 text-center">
          {getConfidenceText()}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 shadow-sm">
      <div className="flex items-start space-x-4">
        {/* Preview of uploaded image */}
        <div 
          className="relative group cursor-pointer"
          onClick={() => openImageViewer(pred)}
        >
          <img 
            src={pred.preview}
            alt={pred.name}
            className="w-32 h-32 object-cover rounded"
          />
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded flex items-center justify-center">
            <Info className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-all" />
          </div>
        </div>

        {/* Result details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900 truncate">
              {pred.name}
            </span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getModelBadgeColor(pred.model_used)}`}>
              {pred.model_used}
            </span>
          </div>

          <DecisionIndicator 
            distance={pred.closest_distance}
            threshold={distanceThreshold}
            count={pred.category_count}
          />

          {pred.confidence_score > 0 && (
            <div className="mt-2">
              <div className="text-xs text-gray-500">Confidence</div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{width: `${pred.confidence_score * 100}%`}}
                />
              </div>
            </div>
          )}

          {pred.category && (
            <div className="mt-2">
              <span className="text-sm font-medium">Category: </span>
              <span className="text-sm text-gray-600">{pred.category}</span>
            </div>
          )}

          {/* Top 10 recommendations */}
      {pred.recs && (
        <div className="mt-2">
          <div className="text-xs text-gray-500 mb-1">Top 10 Similar Images</div>
          <div className="grid grid-cols-5 gap-2">
            {pred.recs.split(',').map((rec, idx) => {
              const similarity = pred.top_matches?.[idx]?.similarity || 0;
              const imageUrl = ImageUrlUtils.getDatasetImageUrl(rec, pred.category);
              
              return (
                <div 
                  key={idx}
                  className="relative group cursor-pointer bg-gray-100 rounded p-1 hover:bg-gray-200 transition-all"
                  onClick={() => openImageViewer(pred, idx + 1)}
                >
                  <div className="text-xs truncate text-gray-600 mb-1" title={rec}>
                    {rec}
                  </div>
                  <div className="aspect-square relative">
                    <img
                      src={imageUrl}
                      alt={rec}
                      className="absolute inset-0 w-full h-full object-cover rounded"
                      onError={(e) => {
                        console.error('Error loading image:', imageUrl);
                        e.target.src = pred.preview;
                      }}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded flex items-center justify-center">
                      <Info className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                  </div>
                  <div className={`text-xs text-center mt-1 px-1 py-0.5 rounded ${
                    similarity > 0.8 ? 'bg-green-100 text-green-800' :
                    similarity > 0.6 ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {(similarity * 100).toFixed(1)}%
                  </div>
                </div>
              );
            })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

  // New state for showing results
  const [showResults, setShowResults] = useState(true);
  
  // Updated SettingsModal component
  const SettingsModal = ({ show, onClose }) => {
    return (
      <Modal 
        show={show} 
        onClose={onClose}
        title="Search Settings"
      >
        <div className="space-y-6">
          {/* Show results toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Show Results</span>
              <p className="text-sm text-gray-500">Display results during processing</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={showResults}
                onChange={(e) => setShowResults(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          {/* Existing settings */}
          {/* Qwen toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Use Qwen Fallback</span>
              <p className="text-sm text-gray-500">Enable AI classification for unknown images</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={useQwen}
                onChange={(e) => setUseQwen(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          
          {/* Distance threshold */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-medium">Distance Threshold (90% similarity)</span>
                <p className="text-sm text-gray-500">Fixed at 0.1 for strict matching</p>
              </div>
              <span className="text-sm font-medium">0.1</span>
            </div>
          </div>
          
          {/* Category threshold removed as it's now based on majority voting */}
        </div>
      </Modal>
    );
  };

  const StatsModal = ({ show, onClose }) => {
    return (
      <Modal
        show={show}
        onClose={onClose}
        title="Search Statistics"
        maxWidth="max-w-4xl"
      >
        <div className="h-[600px] overflow-y-auto">
          {statsUrl && (
            <iframe 
              src={statsUrl}
              className="w-full h-full border-0"
              title="Search Statistics"
            />
          )}
        </div>
      </Modal>
    );
  };

  // ... (предыдущий код)

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Image Search Tool
            </h1>
            <div className="flex space-x-4">
              <button 
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-md hover:bg-gray-100 flex items-center space-x-2"
              >
                <Settings className="w-5 h-5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
              <button
                onClick={() => setShowStats(true)}
                className="p-2 rounded-md hover:bg-gray-100 flex items-center space-x-2"
                disabled={!statsUrl}
              >
                <BarChart2 className="w-5 h-5" />
                <span className="hidden sm:inline">Stats</span>
              </button>
            </div>
          </div>

          {/* File upload */}
          <div className="mb-6">
            <label className="flex justify-center w-full h-32 px-4 transition bg-white border-2 border-gray-300 border-dashed rounded-md appearance-none cursor-pointer hover:border-gray-400 focus:outline-none">
              <span className="flex flex-col items-center space-y-2 pt-5">
                <ImagePlus className="w-8 h-8 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Drop files or click to upload
                </span>
              </span>
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
              />
            </label>
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2">Selected Files:</h3>
              <div className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <span className="text-sm text-gray-600">{file.name}</span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
  <div className="flex space-x-4">
    <button
      onClick={processImages}
      disabled={isProcessing || selectedFiles.length === 0}
      className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
    >
      {isProcessing ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <Send className="w-4 h-4 mr-2" />
          Process Images
        </>
      )}
    </button>
    
    {predictions.length > 0 && (
      <>
        <button
          onClick={downloadCSV}
          className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          <Upload className="w-4 h-4 mr-2" />
          Export CSV
        </button>
        
        <button
          onClick={downloadSubmissionCSV}
          className="flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          <FileDown className="w-4 h-4 mr-2" />
          Download Submission
        </button>
      </>
    )}
  </div>

          {processingStatus && (
            <div className="mt-4 text-sm text-gray-600">
              {processingStatus}
            </div>
          )}

          {/* Results grid */}
        {predictions.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-medium mb-4">Results:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {predictions.map((pred, index) => (
              <ResultCard
                key={index}
                pred={pred}
                openImageViewer={openImageViewer}
              />
            ))}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <SettingsModal 
        show={showSettings}
        onClose={() => setShowSettings(false)}
      />
      
      <StatsModal
        show={showStats}
        onClose={() => setShowStats(false)}
      />
      
      <ImageViewer
        show={showImageViewer}
        onClose={closeImageViewer}
      />
    </div>
  );
};

// Helper components that can be extracted to separate files if needed
const LoadingSpinner = () => (
  <div className="flex items-center justify-center">
    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
  </div>
);

const EmptyState = () => (
  <div className="text-center py-12">
    <ImagePlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
    <h3 className="text-lg font-medium text-gray-900">No images selected</h3>
    <p className="text-sm text-gray-500">Upload images to start searching</p>
  </div>
);

export default ImageClassifier;