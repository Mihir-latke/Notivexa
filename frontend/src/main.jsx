import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App/>
        <Toaster position="top-right" toastOptions={{ duration:3500, style:{ fontFamily:'Inter,sans-serif', fontSize:'13.5px', fontWeight:500, borderRadius:'10px' } }}/>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)