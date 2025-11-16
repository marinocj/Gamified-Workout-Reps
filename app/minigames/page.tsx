'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Activity, ArrowLeft } from 'lucide-react'
import { BreakoutGame } from '@/components/games/breakout-game'
import { DinoGame } from '@/components/games/dino-game'
import dynamic from 'next/dynamic'

// Import PoseLandmarkerPage without SSR since it uses browser APIs
const PoseLandmarkerPage = dynamic(
  () => import('@/components/PoseLandmarkerPage'),
  { ssr: false }
)

const PoseLandmarkerPageSquat = dynamic(
  () => import('@/components/PoseLandMarkerPageSquat'),
  { ssr: false }
)

const PoseLandmarkerPageHand = dynamic(
  () => import('@/components/PoseLandMarkerPageHand'),
  { ssr: false }
)

export default function MinigamesPage() {
  const [selectedGame, setSelectedGame] = useState<'breakout' | 'dino' | null>(null)
  const [dinoExerciseMode, setDinoExerciseMode] = useState<'pushups' | 'squats' | null>(null)
  const [breakoutHandMode, setBreakoutHandMode] = useState<'left' | 'right' | null>(null)

  return (
    <div className="min-h-screen bg-background relative">
      {/* Camera background - only show when game is selected */}
      {selectedGame && (
        <div className="fixed inset-0 z-0" style={{ top: '64px' }}>
          {selectedGame === 'breakout' ? (
            <PoseLandmarkerPageHand />
          ) : selectedGame === 'dino' && dinoExerciseMode === 'squats' ? (
            <PoseLandmarkerPageSquat />
          ) : (
            <PoseLandmarkerPage width={1920} height={1080} embedded={true} />
          )}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border bg-card relative z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-foreground">FormFit</span>
            </div>
            <div className="w-20" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 relative z-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Workout Minigames</h1>
          <p className="mt-2 text-muted-foreground">
            Play retro games powered by your workout movements
          </p>
        </div>

        {!selectedGame ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:max-w-4xl">
            {/* Breakout Card */}
            <Card className="p-6">
              <div className="flex flex-col gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
                  <div className="text-2xl">🎯</div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">Breakout</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Control the paddle with hand movements! Choose which hand to use.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button 
                      className="flex-1" 
                      onClick={() => {
                        setBreakoutHandMode('left')
                        setSelectedGame('breakout')
                      }}
                    >
                      Left Hand
                    </Button>
                    <Button 
                      className="flex-1" 
                      variant="secondary"
                      onClick={() => {
                        setBreakoutHandMode('right')
                        setSelectedGame('breakout')
                      }}
                    >
                      Right Hand
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Dino Card */}
            <Card className="p-6">
              <div className="flex flex-col gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent/10">
                  <div className="text-2xl">🦖</div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">Dino Jump</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Jump with pushups or squats! Choose your exercise mode below.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button 
                      className="flex-1" 
                      onClick={() => {
                        setDinoExerciseMode('pushups')
                        setSelectedGame('dino')
                      }}
                    >
                      Pushups Mode
                    </Button>
                    <Button 
                      className="flex-1" 
                      variant="secondary"
                      onClick={() => {
                        setDinoExerciseMode('squats')
                        setSelectedGame('dino')
                      }}
                    >
                      Squats Mode
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            <Button variant="outline" onClick={() => {
              setSelectedGame(null)
              setDinoExerciseMode(null)
              setBreakoutHandMode(null)
            }}>
              Back to Games
            </Button>
            {selectedGame === 'breakout' && <BreakoutGame />}
            {selectedGame === 'dino' && <DinoGame />}
          </div>
        )}
      </div>
    </div>
  )
}
