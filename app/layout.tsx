import type { Metadata } from 'next'
import { Press_Start_2P } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _pressStart = Press_Start_2P({ 
  weight: '400',
  subsets: ["latin"] 
});

export const metadata: Metadata = {
  title: 'FormFit - ML Workout Form Tracker',
  description: 'Track and improve your workout form with machine learning-powered pose detection',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased ${_pressStart.className}`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
