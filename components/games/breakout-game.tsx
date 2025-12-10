'use client'

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'

// Powerup that drops from special blocks
interface Powerup {
  x: number
  y: number
  width: number
  height: number
  type: 'extraLife' | 'bigPaddle'
  velocityX: number
}

// Atari Breakout clone 

export function BreakoutGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [gameOver, setGameOver] = useState(false)
  
  // Initial variables
  const gameStateRef = useRef({
    paddle: { x: 20, y: 200, width: 15, height: 80 },
    paddlePosition: 0.5, // 0 to 1, where 0 is top and 1 is bottom. We change this variable based on the position of the hand.
    ball: { x: 200, y: 200, dx: 240, dy: 180, radius: 8 },
    bricks: [] as { x: number; y: number; width: number; height: number; active: boolean; hasPowerup: boolean }[],
    powerups: [] as Powerup[],
    keys: { up: false, down: false },
    paddleOriginalHeight: 80,
    lastFrameTime: performance.now(),
  })

  // Listen for handYUpdate events from PoseLandmarkerPageHand
  useEffect(() => {
    const handleHandYUpdate = (e: any) => {
      const { hand, y } = e.detail;
      const invertedY = 1 - y;
      gameStateRef.current.paddlePosition = Math.max(0, Math.min(1, invertedY));
    };

    window.addEventListener('handYUpdate', handleHandYUpdate);

    return () => {
      window.removeEventListener('handYUpdate', handleHandYUpdate);
    };
  }, []);

  // Initial variables for bricks
  useEffect(() => {
    const bricks = []
    const brickRowCount = 5 
    const brickColumnCount = 8 
    const brickWidth = 20
    const brickHeight = 40 
    const brickPadding = 8
    const brickOffsetTop = 40
    const brickOffsetLeft = 380 

    // Create the bricks
    for (let c = 0; c < brickColumnCount; c++) {
      for (let r = 0; r < brickRowCount; r++) {
        bricks.push({
          x: brickOffsetLeft + c * (brickWidth + brickPadding),
          y: brickOffsetTop + r * (brickHeight + brickPadding),
          width: brickWidth,
          height: brickHeight,
          active: true,
          hasPowerup: Math.random() > 0.8, // 20% chance of powerup
        })
      }
    }
    gameStateRef.current.bricks = bricks
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const state = gameStateRef.current

    // Keyboard controls (mostly just for debugging)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') state.keys.up = true
      if (e.key === 'ArrowDown') state.keys.down = true
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') state.keys.up = false
      if (e.key === 'ArrowDown') state.keys.down = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    let animationId: number

    const draw = () => {
      // Calculate delta time for frame-rate independent movement
      const currentTime = performance.now()
      const deltaTime = (currentTime - state.lastFrameTime) / 1000 // convert to seconds
      state.lastFrameTime = currentTime

      // Clear canvas with semi-transparent background (camera is behind)
      ctx.fillStyle = 'rgba(10, 14, 39, 0.7)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Update paddle position (0 to 1)
      if (state.keys.up) {
        state.paddlePosition = Math.max(0, state.paddlePosition - 0.02)
      }
      if (state.keys.down) {
        state.paddlePosition = Math.min(1, state.paddlePosition + 0.02)
      }

      // Convert paddlePosition (0 to 1) to actual y coordinate
      const maxY = canvas.height - state.paddle.height
      state.paddle.y = state.paddlePosition * maxY

      // Paddle
      ctx.fillStyle = '#ff006e'
      ctx.fillRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height)

      // Update ball position with delta time
      state.ball.x += state.ball.dx * deltaTime
      state.ball.y += state.ball.dy * deltaTime

      if (state.ball.y + state.ball.radius > canvas.height || state.ball.y - state.ball.radius < 0) {
        state.ball.dy *= -1
      }

      if (state.ball.x - state.ball.radius < 0) {
        setLives((prev) => {
          const newLives = prev - 1
          if (newLives <= 0) {
            setGameOver(true)
          }
          return newLives
        })
        // Reset ball
        state.ball.x = 200
        state.ball.y = 200
        state.ball.dx = 240
        state.ball.dy = 180
      }

      if (state.ball.x + state.ball.radius > canvas.width) {
        state.ball.dx *= -1
      }

      if (
        state.ball.x - state.ball.radius < state.paddle.x + state.paddle.width &&
        state.ball.x + state.ball.radius > state.paddle.x &&
        state.ball.y + state.ball.radius > state.paddle.y &&
        state.ball.y - state.ball.radius < state.paddle.y + state.paddle.height
      ) {
        state.ball.dx = Math.abs(state.ball.dx) // Always bounce right
        // Add spin based on where it hit the paddle
        const hitPos = (state.ball.y - state.paddle.y) / state.paddle.height
        state.ball.dy = (hitPos - 0.5) * 480 // pixels per second
      }

      // Draw ball
      ctx.fillStyle = '#00f5ff'
      ctx.beginPath()
      ctx.arc(state.ball.x, state.ball.y, state.ball.radius, 0, Math.PI * 2)
      ctx.fill()

      let activeBricks = 0

      // for each brick -> possible perf issue 
      state.bricks.forEach((brick) => {
        if (!brick.active) return
        activeBricks++

        // Draw brick
        ctx.fillStyle = brick.hasPowerup ? '#ffbe0b' : '#b7ff00'
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height)
        ctx.strokeStyle = '#0a0e27'
        ctx.lineWidth = 2
        ctx.strokeRect(brick.x, brick.y, brick.width, brick.height)

        // Check collision
        if (
          state.ball.x + state.ball.radius > brick.x &&
          state.ball.x - state.ball.radius < brick.x + brick.width &&
          state.ball.y + state.ball.radius > brick.y &&
          state.ball.y - state.ball.radius < brick.y + brick.height
        ) {
          // Determine bounce direction
          const overlapLeft = state.ball.x + state.ball.radius - brick.x
          const overlapRight = brick.x + brick.width - (state.ball.x - state.ball.radius)
          const overlapTop = state.ball.y + state.ball.radius - brick.y
          const overlapBottom = brick.y + brick.height - (state.ball.y - state.ball.radius)
          
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom)
          
          if (minOverlap === overlapLeft || minOverlap === overlapRight) {
            state.ball.dx *= -1
          } else {
            state.ball.dy *= -1
          }
          
          brick.active = false
          setScore((prev) => prev + 10)

          if (brick.hasPowerup) {
            state.powerups.push({
              x: brick.x,
              y: brick.y + brick.height / 2 - 10,
              width: 20,
              height: 20,
              type: 'bigPaddle',
              velocityX: -120, // pixels per second, fall to the left
            })
          }
        }
      })

      state.powerups = state.powerups.filter((powerup) => {
        powerup.x += powerup.velocityX * deltaTime // Move left with delta time

        // Draw powerup (big paddle)
        ctx.fillStyle = '#8338ec'
        ctx.fillRect(powerup.x, powerup.y, powerup.width, powerup.height)

        // Check collision with paddle
        if (
          powerup.x + powerup.width > state.paddle.x &&
          powerup.x < state.paddle.x + state.paddle.width &&
          powerup.y + powerup.height > state.paddle.y &&
          powerup.y < state.paddle.y + state.paddle.height
        ) {
          state.paddle.height = Math.min(state.paddle.height + 20, 150)
          setTimeout(() => {
            state.paddle.height = state.paddleOriginalHeight
          }, 10000)
          return false // Remove powerup
        }

        // Remove if off screen (left side)
        return powerup.x + powerup.width > 0
      })

      // Check win condition
      if (activeBricks === 0) {
        setGameOver(true)
      }

      if (!gameOver) {
        animationId = requestAnimationFrame(draw)
      }
    }

    draw()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      cancelAnimationFrame(animationId)
    }
  }, [gameOver])

  const handleRestart = () => {
    setScore(0)
    setLives(3)
    setGameOver(false)
    const state = gameStateRef.current
    state.ball.x = 200
    state.ball.y = 200
    state.ball.dx = 240
    state.ball.dy = 180
    state.paddlePosition = 0.5 // Reset to center
    state.paddle.height = state.paddleOriginalHeight
    state.powerups = []
    state.lastFrameTime = performance.now()
    state.bricks.forEach((brick) => {
      brick.active = true
      brick.hasPowerup = Math.random() > 0.8
    })
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between">
          <div className="text-foreground">
            <span className="font-semibold">Score:</span> {score}
          </div>
          <div className="text-foreground">
            <span className="font-semibold">Lives:</span> {lives}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          className="border-4 border-primary"
          style={{ imageRendering: 'pixelated', backgroundColor: 'rgba(10, 14, 39, 0.7)' }}
        />

        <div className="text-center text-sm text-muted-foreground">
          {gameOver ? (
            <div className="space-y-2">
              <p className="text-lg font-bold text-foreground">
                {lives > 0 ? 'You Win!' : 'Game Over!'}
              </p>
              <button
                onClick={handleRestart}
                className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              >
                Play Again
              </button>
            </div>
          ) : (
            <div>
              <p>Move your hand up and down to control the paddle! (Arrow keys ↑↓ also work for testing)</p>
              <p className="mt-2 text-xs">
                <span className="text-[#ffbe0b]">Yellow bricks</span> drop <span className="text-[#8338ec]">■ Big Paddle</span> powerups
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
