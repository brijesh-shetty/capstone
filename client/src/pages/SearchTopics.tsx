import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/api';

interface Topic {
  id: string;
  subject: string;
  topic: string;
  subtopic: string;
}

interface SearchTopicsProps {
  onSelectTopic: (topicId: string, topicName: string) => void;
}

const SUBJECT_COLORS: Record<string, string> = {
  Physics:   'from-blue-500 to-indigo-600',
  Chemistry: 'from-green-500 to-teal-600',
  Maths:     'from-purple-500 to-pink-600',
  Custom:    'from-orange-500 to-red-500',
};

const SUBJECT_ICONS: Record<string, string> = {
  Physics:   '⚛️',
  Chemistry: '🧪',
  Maths:     '📐',
  Custom:    '✨',
};

export const SearchTopics: React.FC<SearchTopicsProps> = ({ onSelectTopic }) => {
  const [searchQuery, setSearchQuery]       = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [topics, setTopics]                 = useState<Topic[]>([]);
  const [loading, setLoading]               = useState(false);
  const [customTopic, setCustomTopic]       = useState('');
  const [generating, setGenerating]         = useState(false);
  const [customError, setCustomError]       = useState('');
  const [activeTab, setActiveTab]           = useState<'search' | 'custom'>('search');
  const customInputRef                      = useRef<HTMLInputElement>(null);

  const subjects = ['Physics', 'Chemistry', 'Maths'];

  useEffect(() => {
    const timeoutId = setTimeout(() => handleSearch(), 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, selectedSubject]);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<Topic[]>(
        `/topics/search?q=${encodeURIComponent(searchQuery)}&subject=${encodeURIComponent(selectedSubject)}`
      );
      setTopics(response);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomGenerate = async () => {
    const trimmed = customTopic.trim();
    if (trimmed.length < 2) {
      setCustomError('Please enter at least 2 characters.');
      return;
    }
    setCustomError('');
    setGenerating(true);
    try {
      const topic = await apiClient.post<Topic>('/topics/generate', { topicName: trimmed });
      onSelectTopic(topic.id, topic.subtopic);
    } catch (error) {
      setCustomError('Failed to create topic. Please try again.');
      console.error('Custom topic generation failed:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCustomGenerate();
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#1e1b4b', margin: 0 }}>
          🎮 Choose Your Topic
        </h1>
        <p style={{ color: '#6b7280', marginTop: '0.5rem', fontSize: '1.05rem' }}>
          Pick from popular topics or type anything you want to learn
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        background: '#f3f4f6',
        borderRadius: '0.75rem',
        padding: '0.3rem',
        marginBottom: '1.5rem',
        maxWidth: '420px',
        margin: '0 auto 1.5rem auto',
      }}>
        {(['search', 'custom'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '0.6rem 1.2rem',
              border: 'none',
              borderRadius: '0.55rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === tab ? '#fff' : 'transparent',
              color: activeTab === tab ? '#4f46e5' : '#6b7280',
              boxShadow: activeTab === tab ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab === 'search' ? '🔍 Browse Topics' : '✨ Any Topic'}
          </button>
        ))}
      </div>

      {/* ── SEARCH TAB ── */}
      {activeTab === 'search' && (
        <>
          {/* Search Controls */}
          <div style={{
            background: '#fff',
            borderRadius: '1rem',
            padding: '1.5rem',
            boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="🔍  Search topics, subtopics..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  flex: '1 1 220px',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.6rem',
                  fontSize: '0.97rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
                onBlur={e  => (e.currentTarget.style.borderColor = '#e5e7eb')}
              />
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                style={{
                  flex: '0 1 180px',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.6rem',
                  fontSize: '0.97rem',
                  background: '#fff',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="">All Subjects</option>
                {subjects.map(s => (
                  <option key={s} value={s}>{SUBJECT_ICONS[s]} {s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject quick-filter pills */}
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedSubject('')}
              style={{
                padding: '0.4rem 1rem',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                background: selectedSubject === '' ? '#4f46e5' : '#e5e7eb',
                color: selectedSubject === '' ? '#fff' : '#374151',
                transition: 'all 0.2s',
              }}
            >
              All
            </button>
            {subjects.map(s => (
              <button
                key={s}
                onClick={() => setSelectedSubject(selectedSubject === s ? '' : s)}
                style={{
                  padding: '0.4rem 1rem',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  background: selectedSubject === s ? '#4f46e5' : '#e5e7eb',
                  color: selectedSubject === s ? '#fff' : '#374151',
                  transition: 'all 0.2s',
                }}
              >
                {SUBJECT_ICONS[s]} {s}
              </button>
            ))}
          </div>

          {/* Results */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              Loading topics...
            </div>
          ) : topics.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem',
              background: '#fff',
              borderRadius: '1rem',
              color: '#9ca3af',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔍</div>
              <p style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#374151' }}>No topics found</p>
              <p style={{ fontSize: '0.9rem' }}>Try a different search, or use the <strong>Any Topic</strong> tab!</p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '1rem',
            }}>
              {topics.map(topic => {
                const gradient = SUBJECT_COLORS[topic.subject] || SUBJECT_COLORS.Custom;
                const icon = SUBJECT_ICONS[topic.subject] || '📖';
                return (
                  <div
                    key={topic.id}
                    style={{
                      background: '#fff',
                      borderRadius: '1rem',
                      overflow: 'hidden',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      cursor: 'default',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.14)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
                    }}
                  >
                    {/* Card header stripe */}
                    <div style={{
                      background: `linear-gradient(135deg, ${gradientStart(gradient)}, ${gradientEnd(gradient)})`,
                      padding: '1rem 1.2rem 0.8rem',
                      color: '#fff',
                    }}>
                      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
                      <span style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.78rem',
                        background: 'rgba(255,255,255,0.25)',
                        padding: '0.15rem 0.6rem',
                        borderRadius: '999px',
                        fontWeight: 600,
                      }}>
                        {topic.subject}
                      </span>
                    </div>

                    <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
                      <h3 style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e1b4b', margin: '0 0 0.3rem' }}>
                        {topic.topic}
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 1rem' }}>
                        {topic.subtopic}
                      </p>
                      <button
                        onClick={() => onSelectTopic(topic.id, topic.topic)}
                        style={{
                          width: '100%',
                          padding: '0.6rem',
                          border: 'none',
                          borderRadius: '0.55rem',
                          background: '#4f46e5',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#4338ca')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#4f46e5')}
                      >
                        🕹️ Open Arcade
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── CUSTOM TOPIC TAB ── */}
      {activeTab === 'custom' && (
        <div style={{
          maxWidth: '560px',
          margin: '0 auto',
          background: '#fff',
          borderRadius: '1.25rem',
          padding: '2.5rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>✨</div>
          <h2 style={{ fontWeight: 800, fontSize: '1.6rem', color: '#1e1b4b', marginBottom: '0.5rem' }}>
            Any Topic, Any Time
          </h2>
          <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.97rem' }}>
            Type any topic — from <em>Photosynthesis</em> to <em>Machine Learning</em> — and the AI will generate 10 questions for you instantly.
          </p>

          <input
            ref={customInputRef}
            type="text"
            placeholder="e.g. Photosynthesis, Black Holes, World War II..."
            value={customTopic}
            onChange={e => { setCustomTopic(e.target.value); setCustomError(''); }}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '0.9rem 1.2rem',
              border: '2px solid #e5e7eb',
              borderRadius: '0.75rem',
              fontSize: '1rem',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box',
              marginBottom: '0.5rem',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#f97316')}
            onBlur={e  => (e.currentTarget.style.borderColor = customError ? '#ef4444' : '#e5e7eb')}
          />

          {customError && (
            <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.8rem', textAlign: 'left' }}>
              ⚠️ {customError}
            </p>
          )}

          <button
            onClick={handleCustomGenerate}
            disabled={generating || customTopic.trim().length < 2}
            style={{
              width: '100%',
              padding: '0.85rem',
              border: 'none',
              borderRadius: '0.75rem',
              background: generating ? '#d1d5db' : 'linear-gradient(135deg, #f97316, #dc2626)',
              color: generating ? '#9ca3af' : '#fff',
              fontWeight: 700,
              fontSize: '1.05rem',
              cursor: generating ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
              marginTop: '0.5rem',
            }}
          >
            {generating ? '⏳ Generating topic...' : '🚀 Open Arcade'}
          </button>

          <div style={{
            marginTop: '2rem',
            padding: '1rem',
            background: '#fafafa',
            borderRadius: '0.75rem',
            textAlign: 'left',
          }}>
            <p style={{ fontWeight: 700, color: '#374151', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              💡 Try these examples:
            </p>
            {[
              'Photosynthesis',
              'French Revolution',
              'Python Programming',
              'Human Digestive System',
              'Climate Change',
              'Quantum Computing',
            ].map(example => (
              <button
                key={example}
                onClick={() => { setCustomTopic(example); setCustomError(''); customInputRef.current?.focus(); }}
                style={{
                  display: 'inline-block',
                  margin: '0.25rem',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '999px',
                  border: '1.5px solid #e5e7eb',
                  background: '#fff',
                  color: '#4f46e5',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#ede9fe';
                  e.currentTarget.style.borderColor = '#a5b4fc';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#fff';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to extract gradient colours from the Tailwind string
function gradientStart(cls: string): string {
  const map: Record<string, string> = {
    'from-blue-500':   '#3b82f6',
    'from-green-500':  '#22c55e',
    'from-purple-500': '#a855f7',
    'from-orange-500': '#f97316',
  };
  const key = cls.split(' ')[0];
  return map[key] ?? '#6366f1';
}
function gradientEnd(cls: string): string {
  const map: Record<string, string> = {
    'to-indigo-600': '#4f46e5',
    'to-teal-600':   '#0d9488',
    'to-pink-600':   '#db2777',
    'to-red-500':    '#ef4444',
  };
  const key = cls.split(' ')[1];
  return map[key] ?? '#818cf8';
}
