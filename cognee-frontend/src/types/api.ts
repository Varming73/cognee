/**
 * API Response Type Definitions
 * Centralized type definitions for backend API responses
 */

// Dataset Status Types
export type DatasetStatus =
  | 'DATASET_PROCESSING_STARTED'
  | 'DATASET_PROCESSING_INITIATED'
  | 'DATASET_PROCESSING_COMPLETED'
  | 'DATASET_PROCESSING_ERRORED';

// Dataset Types
export interface APIDataset {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string | null;
  status?: DatasetStatus;
}

export interface CreateDatasetRequest {
  name: string;
}

export interface CreateDatasetResponse {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

// Search Types
export interface SearchResult {
  id?: string;
  search_result?: any;
  result?: any;
  dataset_name?: string;
  dataset?: string;
  score?: number;
  metadata?: Record<string, any>;
}

export interface APISearchResponse {
  results: SearchResult[];
  metadata?: {
    total_results: number;
    search_type: string;
    query: string;
    top_k: number;
  };
}

export interface SearchRequest {
  query: string;
  datasets?: string[];
  dataset_ids?: string[];
  search_type?: 'GRAPH_COMPLETION' | 'CHUNKS' | 'SUMMARIES';
  top_k?: number;
  system_prompt?: string;
  use_combined_context?: boolean;
  only_context?: boolean;
  node_name?: string[];
}

// Graph Types
export interface GraphNode {
  id: string;
  label: string;
  type?: string;
  properties?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  properties?: Record<string, any>;
}

export interface DatasetGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Data Ingestion Types
export interface AddDataRequest {
  dataset_id: string;
  files: File[];
}

export interface AddDataResponse {
  success: boolean;
  files_processed: number;
  message?: string;
}

export interface CognifyRequest {
  dataset_id: string;
}

export interface CognifyResponse {
  success: boolean;
  status: DatasetStatus;
  message?: string;
}

// Health Check Types
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version?: string;
  dependencies?: {
    database: boolean;
    llm: boolean;
    vector_db: boolean;
  };
}

// Error Response Types
export interface APIError {
  error: string;
  message: string;
  status_code: number;
  details?: Record<string, any>;
}

// Utility type for API responses
export type APIResponse<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: APIError;
};
