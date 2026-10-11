// Captured from a real DeepSeek generation/composition test. No credentials.
export const LIVE_RESEARCH_FLOW = `flowchart TB
User[User]
FastAPI[FastAPI POST /research]
Guardrail[Auth Rate Limit Input Guardrail]
Queue[Redis Stream job queue]
Worker[Worker]
CacheHit{Cache hit}
LTMHit{LTM hit}
Store[Store Redis cache and Postgres]
Result[Result redis result key]
GetResult[GET /result/job_id]
TensorZero[TensorZero Gateway GPT-4o with Groq fallback]
OutputGuardrail[Output Guardrail]
subgraph LangGraph Multi-Agent Pipeline
Search[Search Agent gathers key facts]
Summarize[Summarize Agent condenses into bullets]
Writer[Writer Agent full structured report]
Critic{Critic approves}
end
User --> FastAPI
FastAPI --> Guardrail
Guardrail -->|blocked| User
Guardrail -->|safe| Queue
Queue --> Worker
Worker --> CacheHit
CacheHit -->|yes| Store
CacheHit -->|no| LTMHit
LTMHit -->|yes| Store
LTMHit -->|no| Search
Search --> Summarize
Summarize --> Writer
Writer --> Critic
Critic -->|no, retry max 2| Search
Critic -->|yes| OutputGuardrail
OutputGuardrail --> Store
Search --> TensorZero
Summarize --> TensorZero
Writer --> TensorZero
Critic --> TensorZero
Store --> Result
User --> GetResult
Result --> GetResult
GetResult --> User`;

export const LIVE_RESEARCH_DUPLICATE_PLAN = {
  title: 'How one request flows',
  mainPath: [
    'User',
    'FastAPI',
    'Guardrail',
    'Queue',
    'Worker',
    'CacheHit',
    'LTMHit',
    'Search',
    'Summarize',
    'Writer',
    'Critic',
    'OutputGuardrail',
    'Store',
    'Result',
    'GetResult',
    'User',
  ],
  lanes: [
    {
      title: 'Request journey',
      kind: 'journey',
      nodeIds: [
        'User',
        'FastAPI',
        'Guardrail',
        'Queue',
        'Worker',
        'CacheHit',
        'LTMHit',
        'Search',
        'Summarize',
        'Writer',
        'Critic',
        'OutputGuardrail',
        'Store',
        'Result',
        'GetResult',
      ],
    },
    {
      title: 'LangGraph Multi-Agent Pipeline',
      kind: 'journey',
      nodeIds: ['Search', 'Summarize', 'Writer', 'Critic'],
    },
    { title: 'Shared dependencies', kind: 'support', nodeIds: ['TensorZero'] },
  ],
};
