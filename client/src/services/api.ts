const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<T> {
    const url = `${API_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (this.token) {
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${this.token}`
      };
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  post<T>(endpoint: string, body: any): Promise<T> {
    return this.makeRequest('POST', endpoint, body);
  }

  // POST that returns a binary Blob (e.g. TTS audio) instead of JSON. Fetched
  // with auth so it can be turned into a same-origin object URL on the client —
  // which keeps Web Audio's AnalyserNode untainted for lip-sync.
  async postBlob(endpoint: string, body: any): Promise<Blob> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return response.blob();
  }

  get<T>(endpoint: string): Promise<T> {
    return this.makeRequest('GET', endpoint);
  }

  put<T>(endpoint: string, body: any): Promise<T> {
    return this.makeRequest('PUT', endpoint, body);
  }
}

export const apiClient = new ApiClient();
