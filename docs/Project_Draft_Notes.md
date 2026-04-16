# Job Application Assistant — First Draft

## Introduction

- Job searching is tedious and repetitive: every application requires tailoring a cover letter, researching the company, and preparing for interviews
- Most applicants reuse a generic CV and cover letter — leading to lower response rates
- Our project: a cloud-native **Job Application Assistant** that lets users upload their CV once, then paste or upload any job description to get personalised outputs
- The platform parses both documents, runs a skills-gap analysis, and uses an LLM to generate a tailored cover letter and interview-preparation material
- Goal: demonstrate a realistic, end-to-end cloud application that combines document processing, AI/ML inference, and a user-facing web interface — all on AWS

## A description of the functionality and scope of their project

**Core features (MVP)**
- CV upload (PDF) — parsed and stored as a structured profile (skills, experience, education) and user fills out form with predefined questions and/ or llm generated questions => goal: collect at least predefined set of information necessary for following comparison 
- Job description input — paste text or upload a file
- Skills-gap analysis — compare CV profile against job requirements, produce a match score and a list of missing / weak skills
- Cover letter generation/ or outline/ review of existing — LLM produces a tailored cover letter that highlights relevant experience and addresses gaps
- Application dashboard — simple list of saved jobs with their generated outputs so the user can track applications
- The React frontend uses short polling against the API to detect when async results are ready, keeping the frontend stateless and avoiding the need for persistent connections such as WebSockets


**Optional / stretch features**
- Job description scraping — user pastes a URL and the system extracts the job description automatically
- Richer dashboard — filters, status tracking, side-by-side comparison of multiple roles
- User authentication — MVP has no auth or a simple approach; AWS Cognito as a stretch goal
- CV improvement suggestions — LLM recommends how to strengthen the CV for a target role
- Interview preparation — LLM generates likely interview questions for the role with suggested talking points

## A description of the motivation for selecting the project: how is the project going to help the team improve their knowledge and skills

**Connection to course content and lab sessions**
- The project directly applies cloud architecture principles studied in class: designing for failure, elasticity, decoupled components, and security
- Builds on lab-session experience with core AWS services (S3, Elastic Beanstalk, Lambda, CloudWatch) and extends into services not covered in labs (Bedrock, Textract, Cognito)
- Gives the team hands-on practice with the twelve-factor methodology in a realistic setting (config via environment, stateless processes, disposability, logs as event streams, etc.)

**Why this project is interesting to us**
- Solves a real problem we face as students entering the job market
- Covers a broad range of AWS services — from storage and compute to AI/ML and CDN — forcing us to learn how they integrate
- Requires both synchronous (API calls) and asynchronous (document processing pipelines) patterns, deepening our understanding of event-driven architectures
- Involves working with an LLM via Bedrock — a rapidly growing area in cloud computing that goes beyond traditional CRUD applications
- The project is scoped so the MVP is achievable, but stretch features let us push further if time allows

## A listing of the resources and services required to build their solution

**AWS services**

| Service | Purpose |
|---------|---------|
| **S3** | Store uploaded CVs and job description files; triggers the processing pipeline via event notifications |
| **Textract** | Extract structured text from PDF CVs (tables, key-value pairs) |
| **Lambda** | Event-driven async processing: triggered on S3 upload, runs Textract parsing and Bedrock LLM calls, writes results to DynamoDB — as used in Labs 6, 8 |
| **SQS** | Decouple Lambda processing from the API — notify backend when async results are ready; also used in Lab 6 |
| **Elastic Beanstalk** | Host the containerised FastAPI backend (REST API) with auto-scaling and load balancing — as used in Labs 3-5, 7 |
| **Bedrock** | LLM inference for cover letter generation, skills-gap analysis, and interview prep |
| **DynamoDB** | Store user profiles, parsed CV data, job records, and all generated outputs (cover letters, interview prep) — document-oriented, serverless, pairs well with Lambda, used in labs |
| **CloudFront** | Serve the static React frontend build from S3 with low latency |
| **CloudWatch** | Centralised logging and monitoring across all services |
| **Cognito** _(stretch)_ | User authentication if time permits — MVP has no auth or a simple approach |

**Other tools and frameworks**
- Python 3.13, managed with `uv`
- FastAPI for the backend REST API
- React for the frontend
- Docker for containerisation (EB deployment)
- GitHub for version control and collaboration
- GitHub Actions for CI/CD (build, test, deploy) — as used in Lab 4
- AWS resources created via console / CLI; AWS CDK as an optional future improvement

## A listing of the planned use of the 160 hours for all the main tasks of the project

> initial high level draft. to be updated with actual project tasks and time estimations

| Task | Est. hours | Notes |
|------|-----------|-------|
| Architectural design & planning | 15 | Service selection, system diagram, API contracts, DB schema |
| Research & documentation on AWS services | 15 | Textract, Bedrock, EB, DynamoDB — tutorials and proof-of-concepts |
| Backend development (FastAPI + Lambda) | 35 | REST endpoints, document processing pipeline, Bedrock integration |
| Frontend development (Streamlit / React) | 20 | UI screens, API integration, basic styling |
| Infrastructure & deployment (CI/CD) | 20 | GitHub Actions pipeline, Docker, EB setup, CloudFront config |
| Testing & debugging | 15 | Unit tests, integration tests, end-to-end testing |
| Meetings & coordination | 15 | Weekly syncs, code reviews, teacher check-ins |
| Written documentation (draft + final report) | 15 | First draft, final report, presentation slides |
| Buffer / stretch features | 10 | Cognito auth, CV suggestions, URL scraping |
| **Total** | **160** | |
