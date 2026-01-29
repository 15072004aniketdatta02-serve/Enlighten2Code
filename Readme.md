# enlighten2code

enlighten2code is a high-performance code practicing platform built using the PERN stack (PostgreSQL, Express, React, Node.js). It leverages the **Judge0 API** to provide a robust, multi-language code execution environment for developers to practice algorithmic challenges.

## 🚀 Features

-   **Real-time Code Execution:** Compile and run code in 50+ languages using Judge0.
-   **Problem Library:** A curated list of coding challenges categorized by difficulty (Easy, Medium, Hard).
-   **Interactive Editor:** Seamless coding experience powered by the Monaco Editor.
-   **User Authentication:** Secure login and registration using JWT and bcrypt.
-   **Submission Tracking:** View past submissions, execution time, and memory usage.
-   **Progress Dashboard:** Track solved problems and skill improvements.

## 🛠️ Tech Stack

-   **Frontend:** React.js, Tailwind CSS, Monaco Editor, Axios.
-   **Backend:** Node.js, Express.js.
-   **Database:** PostgreSQL (Relational data for users, problems, and submissions).
-   **Execution Engine:** Judge0 (Rapid API or self-hosted).

## 📋 Prerequisites

-   Node.js (v16+)
-   PostgreSQL
-   Judge0 API Key (via RapidAPI or a local instance)

## ⚙️ Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/15072004aniketdatta02-serve/Enlighten2Code
    cd enlighten2code
    ```

2.  **Install Dependencies:**
    ```bash
    # Install backend dependencies
    cd server
    npm install

    # Install frontend dependencies
    cd ../client
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the `server` directory:
    ```env
    PORT=5000
    DATABASE_URL=postgres://user:password@localhost:5432/enlighten2code
    JWT_SECRET=your_jwt_secret
    JUDGE0_API_KEY=your_rapidapi_key
    JUDGE0_HOST=judge0-ce.p.rapidapi.com
    ```

4.  **Database Setup:**
    ```bash
    cd server
    # Run migrations/seeders to populate the database
    npm run migrate
    ```

5.  **Run the Application:**
    ```bash
    # Start the server (from /server)
    npm run dev

    # Start the client (from /client)
    npm start
    ```

## 🧪 Usage

1.  Register a new account.
2.  Select a problem from the dashboard.
3.  Write your solution in the editor.
4.  Click **Run** to test against sample cases or **Submit** to evaluate against all hidden test cases.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

