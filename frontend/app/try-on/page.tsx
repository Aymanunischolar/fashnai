'use client';

import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Upload, Sparkles, User, Ruler, UserCircle, Camera, X, Image as ImageIcon } from 'lucide-react';
import axios from 'axios';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
interface TryOnResult {
  generated_image_description: string;
  fit_analysis: string;
  style_recommendations: string[];
  confidence_score: number;
  size_recommendation: string;
  product_name: string;
  warnings: string[];
  generated_image_base64: string | null;
}

interface ProductSpecification {
  product_name: string;
  brand: string;
  category: string;
  color: string;
  material: string;
  sizes_available: string[];
  care_instructions: string | null;
  features: string[];
  fit_type: string | null;
  [key: string]: any;
}

function VirtualTryOnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productUrl = searchParams.get('url');

  const [userSize, setUserSize] = useState('');
  const [userHeight, setUserHeight] = useState('');
  const [userBodyType, setUserBodyType] = useState('');
  const [userImageBase64, setUserImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TryOnResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cachedSpecs, setCachedSpecs] = useState<ProductSpecification | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load cached product specs from sessionStorage
  useEffect(() => {
    const cached = sessionStorage.getItem('tryon_product_specs');
    if (cached) {
      try {
        setCachedSpecs(JSON.parse(cached));
      } catch (e) {
        console.error('Failed to parse cached specs:', e);
      }
    }
  }, []);

  const handleImageUpload = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be smaller than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setUserImageBase64(base64);
      setImagePreview(base64);
      setError(null);
    };
    reader.onerror = () => {
      setError('Failed to read image file');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);

  const removeImage = useCallback(() => {
    setUserImageBase64(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleTryOn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productUrl) {
      setError('No product URL provided');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await axios.post(`${API_URL}/api/virtual-tryon`, {
        product_url: decodeURIComponent(productUrl),
        user_size: userSize || null,
        user_height: userHeight || null,
        user_body_type: userBodyType || null,
        user_image_base64: userImageBase64 || null,
        product_specs: cachedSpecs || null
      });

      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to perform virtual try-on');
      console.error('Virtual try-on error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">F</span>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                FashnAI
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Virtual Try-On
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get AI-powered insights on how this product would look and fit on you
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <form onSubmit={handleTryOn} className="space-y-6">
            <div>
              <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                <User className="w-4 h-4 mr-2" />
                Your Size
              </label>
              <input
                type="text"
                value={userSize}
                onChange={(e) => setUserSize(e.target.value)}
                placeholder="e.g., M, L, 32, 8"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Optional: Your typical clothing size</p>
            </div>

            <div>
              <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                <Ruler className="w-4 h-4 mr-2" />
                Your Height
              </label>
              <input
                type="text"
                value={userHeight}
                onChange={(e) => setUserHeight(e.target.value)}
                placeholder="e.g., 5'8&quot;, 173cm"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Optional: Your height in any format</p>
            </div>

            <div>
              <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                <UserCircle className="w-4 h-4 mr-2" />
                Body Type
              </label>
              <select
                value={userBodyType}
                onChange={(e) => setUserBodyType(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                <option value="">Select body type (optional)</option>
                <option value="slim">Slim</option>
                <option value="athletic">Athletic</option>
                <option value="average">Average</option>
                <option value="curvy">Curvy</option>
                <option value="plus-size">Plus Size</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Optional: Helps provide better fit recommendations</p>
            </div>

            {/* Image Upload Section */}
            <div>
              <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                <Camera className="w-4 h-4 mr-2" />
                Your Photo
              </label>

              {!imagePreview ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center space-y-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      isDragging ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      <Upload className={`w-6 h-6 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {isDragging ? 'Drop your photo here' : 'Drag and drop your photo here'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">or click to browse</p>
                    </div>
                    <p className="text-xs text-gray-400">PNG, JPG up to 10MB</p>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden border border-gray-200">
                  <div className="relative w-full h-64">
                    <Image
                      src={imagePreview}
                      alt="Your uploaded photo"
                      fill
                      className="object-contain bg-gray-50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-600" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-3">
                    <p className="text-white text-sm flex items-center">
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Photo uploaded
                    </p>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Optional: Upload a photo for personalized fit analysis based on your body shape and proportions
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !productUrl}
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Analyze Fit & Style</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8">
            <h3 className="text-red-800 font-semibold mb-2">Error</h3>
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Product Info */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{result.product_name}</h2>
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <span className="text-sm text-gray-500">Confidence Score:</span>
                  <span className="ml-2 font-bold text-blue-600">{(result.confidence_score * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-gray-500">Recommended Size:</span>
                  <span className="ml-2 font-bold text-purple-600">{result.size_recommendation}</span>
                </div>
              </div>
            </div>

            {/* Generated Try-On Image */}
            {result.generated_image_base64 && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                  <Sparkles className="w-5 h-5 mr-2 text-purple-600" />
                  Virtual Try-On Preview
                </h3>
                <div className="relative w-full max-w-md mx-auto rounded-xl overflow-hidden border border-gray-200">
                  <Image
                    src={result.generated_image_base64}
                    alt="Virtual try-on preview"
                    width={512}
                    height={512}
                    className="w-full h-auto object-contain"
                  />
                </div>
                <p className="text-xs text-gray-500 text-center mt-3">
                  AI-generated preview - actual results may vary
                </p>
              </div>
            )}

            {/* Warnings */}
            {result.warnings && result.warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                <h3 className="font-bold text-yellow-800 mb-3">⚠️ Important Considerations</h3>
                <ul className="space-y-2">
                  {result.warnings.map((warning, index) => (
                    <li key={index} className="text-yellow-700 flex items-start">
                      <span className="mr-2">•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Visualization Description */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">How It Would Look On You</h3>
              <p className="text-gray-700 leading-relaxed">{result.generated_image_description}</p>
            </div>

            {/* Fit Analysis */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Fit Analysis</h3>
              <p className="text-gray-700 leading-relaxed">{result.fit_analysis}</p>
            </div>

            {/* Style Recommendations */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Style Recommendations</h3>
              <div className="space-y-3">
                {result.style_recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {index + 1}
                    </div>
                    <p className="text-gray-700">{recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Info Note */}
        {!result && !loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
            <p className="text-blue-800">
              Fill in your details above to get personalized fit analysis and styling recommendations.
              All fields are optional, but more information leads to better recommendations!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function VirtualTryOn() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Virtual Try-On...</p>
        </div>
      </div>
    }>
      <VirtualTryOnContent />
    </Suspense>
  );
}
