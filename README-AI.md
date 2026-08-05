# CRITICAL REMINDER FOR AI AGENTS

THERE ARE TWO GIT REPOSITORIES IN THIS PROJECT. DO NOT MESS THIS UP.

1. **The "All" Repo (Backend & General Files):**
   - Path: `G:\college project\proj`
   - Remote: `https://github.com/ezzand7722/honeypotai-system.git`
   - Purpose: Contains the backend code, aisystem, and tracks the overall project folder (except the frontend directory contents which are tracked separately).

2. **The "Frontend" Repo (Netlify Deployment):**
   - Path: `G:\college project\proj\frontend`
   - Remote: `https://github.com/ezzand7722/frontend.git`
   - Purpose: **THIS IS THE REPO NETLIFY LISTENS TO.** If you make ANY changes to the React frontend (e.g., inside `frontend/src`), you MUST `cd` into `G:\college project\proj\frontend` and commit/push from THERE. 

**IF YOU PUSH FRONTEND CHANGES TO THE "ALL" REPO ONLY, NETLIFY WILL NOT UPDATE AND THE USER WILL BE FURIOUS.** 

Always verify which directory you are in before running `git commit` and `git push`.
