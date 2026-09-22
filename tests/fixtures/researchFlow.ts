export const RESEARCH_FLOW = `flowchart TD
    User([User])
    API[FastAPI<br/>POST /research]
    SEC[Auth<br/>Rate Limit<br/>Input Guardrail]
    Q[Redis Stream<br/>job queue]
    W[Worker]

    C{Cache hit}
    L{LTM hit}

    subgraph AG[LangGraph Multi-Agent Pipeline]
        A1[Search Agent<br/>gathers key facts]
        A2[Summarize Agent<br/>condenses into bullets]
        A3[Writer Agent<br/>full structured report]
        A4{Critic approves}
    end

    TZ[TensorZero Gateway<br/>GPT-4o with Groq fallback]
    GO[Output Guardrail]
    S[Store<br/>Redis cache and Postgres]
    RES[Result<br/>redis result key]
    POLL[GET /result/job_id]

    User --> API
    API --> SEC
    SEC -->|blocked| User
    SEC -->|safe| Q
    Q --> W
    W --> C

    C -->|yes| S
    C -->|no| L
    L -->|yes| S
    L -->|no| A1

    A1 --> A2
    A2 --> A3
    A3 --> A4
    A4 -->|no, retry max 2| A1
    A4 -->|yes| GO
    GO --> S

    A1 --> TZ
    A2 --> TZ
    A3 --> TZ
    A4 --> TZ

    S --> RES
    User --> POLL
    RES --> POLL
    POLL --> User`;
