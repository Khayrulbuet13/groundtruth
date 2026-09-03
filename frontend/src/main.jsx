import 'katex/dist/katex.min.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LazyMotion, domAnimation, MotionConfig } from 'motion/react';
import QuizApp from './QuizApp';
import { AuthProvider } from './lib/AuthContext';
import { DataProvider } from './lib/DataContext';
import { ThemeProvider } from './lib/ThemeContext';
import './index.css';

// This is a self-practice tool, not a proctored exam — the whole question bank (answers
// included) ships to the browser up front so answering doesn't need a server round trip.
// Anyone who opens the console can find the answer key. Might as well say so.
console.log(
  '%cWell, well, well. 🕵️',
  'font-family: monospace; font-weight: bold; font-size: 16px;'
);
console.log(
  "%cThis is a self-practice app, so the whole question bank — answers included — ships to your browser in one go. Simpler and faster than round-tripping to a server every time you pick an option.\n\nSo yes, you can dig through the network tab or app state and find every answer before you ever attempt a question. Nobody's stopping you, and nobody's grading you.\n\nThe only person you'd be fooling is you. Go answer for real — you'll actually learn something.",
  'font-family: monospace; font-size: 13px;'
);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <DataProvider>
            <LazyMotion features={domAnimation}>
              <MotionConfig reducedMotion="user">
                <QuizApp />
              </MotionConfig>
            </LazyMotion>
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
