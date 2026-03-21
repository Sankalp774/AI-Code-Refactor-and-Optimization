export type CodeBlockType = 'function' | 'class' | 'module' | 'main'

export interface CodeBlock {
  block_type: CodeBlockType | string
  name: string
  start_line: number
  end_line: number
  original_code: string
  explanation: string
  anti_patterns: string[]
  suggestions: string[]
}

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical'

export interface SecurityIssue {
  severity: SecuritySeverity
  description: string
  location: string
  bandit_finding?: Record<string, unknown> | null
}

export interface AnalysisResponse {
  file_name: string
  overall_score: number
  blocks: CodeBlock[]
  security_issues: SecurityIssue[]
  general_optimizations: string[]
  summary: string
}

export interface RefactoredResponse {
  refactored_code: string
  changes_summary: string
  performance_improvements: string[]
}

