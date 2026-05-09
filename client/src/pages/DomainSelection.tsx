import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface DomainProgress {
  id: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  currentLevel: number;
  totalXpInDomain: number;
  rank: string;
  isStarted: boolean;
}

interface DomainSelectionProps {
  onSelectDomain: (slug: string) => void;
  onBack: () => void;
}

export const DomainSelection: React.FC<DomainSelectionProps> = ({ onSelectDomain, onBack }) => {
  const [domains, setDomains] = useState<DomainProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchDomains = async () => {
    try {
      const response = await apiClient.get<DomainProgress[]>('/domains');
      setDomains(response);
    } catch (error) {
      console.error('Failed to load domains', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  const handleGenerateCustom = async () => {
    if (!searchQuery.trim()) return;
    setIsGenerating(true);
    try {
      const newDomain = await apiClient.post<any>('/domains/generate', {
        name: searchQuery,
      });
      onSelectDomain(newDomain.slug);
    } catch (error) {
      console.error('Failed to generate domain:', error);
      alert('Failed to generate custom domain. Please try again.');
      setIsGenerating(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-xl font-bold text-gray-500 animate-pulse">Loading Domains...</div>;
  }

  const filteredDomains = domains.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    d.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-semibold mr-4">
            &larr; Back to Dashboard
          </button>
          <h1 className="text-4xl font-extrabold text-gray-900">Choose Your Path</h1>
        </div>
      </div>

      {/* Search & Create Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 mb-8 flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400">
            🔍
          </span>
          <input 
            type="text" 
            placeholder="Search domains or type a new one to generate..." 
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {searchQuery.trim().length > 0 && filteredDomains.length === 0 && (
          <button 
            onClick={handleGenerateCustom}
            disabled={isGenerating}
            className={`px-6 py-3 rounded-xl font-bold text-white shadow-md transition-all whitespace-nowrap flex items-center justify-center ${
              isGenerating 
                ? 'bg-indigo-400 cursor-wait' 
                : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5'
            }`}
          >
            {isGenerating ? (
              <><span className="animate-spin mr-2">⏳</span> AI is Creating...</>
            ) : (
              <>✨ Generate Custom Domain</>
            )}
          </button>
        )}
      </div>

      {filteredDomains.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredDomains.map(domain => (
            <div 
              key={domain.id}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 flex flex-col cursor-pointer"
              onClick={() => onSelectDomain(domain.slug)}
            >
              <div 
                className="h-32 p-6 flex flex-col justify-end relative overflow-hidden"
                style={{ backgroundColor: domain.color + '15' }}
              >
                <div 
                  className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20"
                  style={{ backgroundColor: domain.color }}
                ></div>
                <div className="text-6xl mb-2 z-10">{domain.icon}</div>
                <h2 className="text-2xl font-bold z-10" style={{ color: domain.color }}>{domain.name}</h2>
              </div>
              
              <div className="p-6 flex-grow flex flex-col">
                <p className="text-gray-600 mb-6 flex-grow">{domain.description}</p>
                
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-gray-700">Level {domain.currentLevel}</span>
                    <span className="text-xs font-bold px-2 py-1 rounded bg-white border border-gray-200 shadow-sm" style={{ color: domain.color }}>
                      {domain.rank}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="h-2 rounded-full transition-all duration-1000"
                      style={{ 
                        width: `${Math.min(100, (domain.currentLevel / 4) * 100)}%`,
                        backgroundColor: domain.color 
                      }}
                    ></div>
                  </div>
                  <div className="text-right mt-1">
                    <span className="text-xs text-gray-500 font-mono">{domain.totalXpInDomain} XP</span>
                  </div>
                </div>

                <button 
                  className="w-full mt-4 py-3 rounded-lg text-white font-bold text-lg shadow-md hover:shadow-lg transition-all"
                  style={{ backgroundColor: domain.color }}
                >
                  {domain.isStarted ? 'Continue Journey' : 'Start Learning'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl border border-gray-200 shadow-sm">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">No domains found</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">
            We couldn't find any existing domain matching "{searchQuery}". But you can ask our AI to create a full learning path for it right now!
          </p>
          {!isGenerating && (
            <button 
              onClick={handleGenerateCustom}
              className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
            >
              ✨ Create "{searchQuery}" Course
            </button>
          )}
        </div>
      )}
    </div>
  );
};
