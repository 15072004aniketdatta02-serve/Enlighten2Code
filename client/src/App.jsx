import { useState } from 'react'

function App() {
    const [count, setCount] = useState(0)

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
            <h1 className="text-4xl font-bold mb-4">Welcome to Enlighten2Code</h1>
            <p className="text-lg mb-8">Start coding your way to enlightenment.</p>
            <div className="card">
                <button
                    onClick={() => setCount((count) => count + 1)}
                    className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition"
                >
                    count is {count}
                </button>
            </div>
        </div>
    )
}

export default App
