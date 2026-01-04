# TaskBack360
https://tt360.vercel.app/sign-in
TaskBack360 is a **real-time team collaboration and task management backend**, inspired by tools like Jira.  
It enables organizations to manage projects, tasks, and team communication efficiently with live updates.

The system is designed for **team-based workflows**, where users belong to an organization and collaborate through projects and task boards.

---

## 🚀 Features

### 🔐 Authentication & Organization Access
- User **signup / login**
- Organization-based access using a **company code**
- Only users with a valid organization code can join the workspace

### 💬 Team Messaging
- Real-time messaging between users within the same organization
- Designed for fast internal communication

### 📁 Project Management
- Create and manage multiple projects
- Add/remove members from projects
- Project-level access control

### ✅ Task Management (Jira-style workflow)
- Create tasks inside projects
- Assign users to tasks
- Add comments to tasks
- Move tasks across workflow stages:
  - **Created**
  - **In Progress**
  - **In Review**
  - **Done**

### ⚡ Real-time Updates
- Instant task updates and comments using **Socket.IO**
- Live sync across all connected clients
- Redis Pub/Sub used for scalability

---

## 🛠 Tech Stack

**Backend**
- Node.js
- Express.js
- TypeScript

**Real-time**
- Socket.IO
- Redis (Pub/Sub)

**Database**
- PostgreSQL

**Other**
- REST APIs
- JWT-based authentication

---

## 🧱 Architecture Overview

- REST APIs for authentication, projects, and task operations
- WebSocket layer for real-time updates (tasks, comments, messages)
- Redis used to synchronize events across multiple instances
- Designed to scale horizontally

---

## ⚙️ Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- PostgreSQL
- Redis

### Installation

```bash
git clone https://github.com/AnshulBadoni/TaskBack360.git
cd TaskBack360
npm install
