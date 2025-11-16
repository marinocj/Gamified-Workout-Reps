'use client'

import { useEffect, useRef, useState } from 'react'

export function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [pushupCount, setPushupCount] = useState(0)
  
  const gameStateRef = useRef({
    dino: { x: 50, y: 150, width: 40, height: 40, velocityY: 0, jumping: false },
    obstacles: [] as { x: number; y: number; width: number; height: number }[],
    ground: 200,
    gravity: 400,
    jumpForce: -400,
    targetSpeed: 200, 
    frameCount: 0,
    score: 0,
    isGameOver: false,
    lastFrameTime: performance.now(),
    obstacleTimer: 0, 
  })

  // FPS tracking (debugging)
  const fpsRef = useRef({
    lastTime: performance.now(),
    frames: 0,
    fps: 0,
  })

  // Listen for pushup OR squat events to trigger jumps
  useEffect(() => {
    const handlePushupCompleted = (e: any) => {
      console.log("Pushup detected in game:", e.detail); // debugging in console
      setPushupCount(e.detail.repCount);
      // Trigger jump
      if (!gameStateRef.current.dino.jumping && !gameStateRef.current.isGameOver) {
        gameStateRef.current.dino.velocityY = gameStateRef.current.jumpForce;
        gameStateRef.current.dino.jumping = true;
      }
    };

    const handleSquatCompleted = (e: any) => {
      console.log("Squat detected in game:", e.detail); // debugging in console
      setPushupCount(e.detail.repCount);
      // Trigger jump
      if (!gameStateRef.current.dino.jumping && !gameStateRef.current.isGameOver) {
        gameStateRef.current.dino.velocityY = gameStateRef.current.jumpForce;
        gameStateRef.current.dino.jumping = true;
      }
    };

    window.addEventListener("pushupCompleted", handlePushupCompleted);
    window.addEventListener("squatCompleted", handleSquatCompleted);

    return () => {
      window.removeEventListener("pushupCompleted", handlePushupCompleted);
      window.removeEventListener("squatCompleted", handleSquatCompleted);
    };
  }, []); 

  // Sync internal score to React state periodically (for UI display)
  useEffect(() => {
    const interval = setInterval(() => {
      setScore(gameStateRef.current.score);
    }, 100); // Update every 100ms

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const state = gameStateRef.current

    // Spacebar controls (debugging)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !state.dino.jumping && !state.isGameOver) {
        jump()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    // Jump function to be called by spacebar OR pushup/sit-up detection
    const jump = () => {
      if (!state.dino.jumping && !state.isGameOver) {
        state.dino.velocityY = state.jumpForce
        state.dino.jumping = true
      }
    }

    // Make jump function available globally for pose detection
    ;(window as any).dinoJump = jump

    // Game loop
    let animationId: number

    const cachedFpsTextWidth = { value: 0, text: '' }

    const draw = () => {
      // Calculate delta time for frame-rate independent movement
      const currentTime = performance.now()
      const deltaTime = (currentTime - state.lastFrameTime) / 1000 // convert to seconds
      state.lastFrameTime = currentTime

      // Use opaque background for better performance
      ctx.fillStyle = 'rgba(10, 14, 39, 0.7)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      state.frameCount++

      // Update dino with delta time
      state.dino.velocityY += state.gravity * deltaTime
      state.dino.y += state.dino.velocityY * deltaTime

      // Ground collision
      if (state.dino.y >= state.ground - state.dino.height) {
        state.dino.y = state.ground - state.dino.height
        state.dino.velocityY = 0
        state.dino.jumping = false
      }

      // Draw ground
      ctx.fillStyle = '#b7ff00'
      ctx.fillRect(0, state.ground, canvas.width, 2)

      // Draw dino
      ctx.fillStyle = '#ff006e'
      ctx.fillRect(state.dino.x, state.dino.y, state.dino.width, state.dino.height)

      // Spawn obstacles using time-based accumulator
      state.obstacleTimer += deltaTime
      if (state.obstacleTimer >= 2.17) { 
        state.obstacles.push({
          x: canvas.width,
          y: state.ground - 30,
          width: 20,
          height: 30,
        })
        state.obstacleTimer = 0
      }

      // Update obstacles with delta time
      ctx.fillStyle = '#00f5ff'
      for (let i = state.obstacles.length - 1; i >= 0; i--) {
        const obstacle = state.obstacles[i]
        obstacle.x -= state.targetSpeed * deltaTime // frame-rate independent movement

        // Draw obstacle
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height)

        // Check collision
        if (
          state.dino.x < obstacle.x + obstacle.width &&
          state.dino.x + state.dino.width > obstacle.x &&
          state.dino.y < obstacle.y + obstacle.height &&
          state.dino.y + state.dino.height > obstacle.y
        ) {
          state.isGameOver = true
          setGameOver(true)
        }

        // Remove off-screen obstacles
        if (obstacle.x + obstacle.width < 0) {
          state.score++
          state.obstacles.splice(i, 1)
        }
      }

      // Calculate FPS
      const fpsData = fpsRef.current
      fpsData.frames++
      const fpsCurrentTime = performance.now()
      const fpsDeltaTime = fpsCurrentTime - fpsData.lastTime
      
      if (fpsDeltaTime >= 1000) {
        fpsData.fps = Math.round((fpsData.frames * 1000) / fpsDeltaTime)
        fpsData.frames = 0
        fpsData.lastTime = fpsCurrentTime
      }

      // Draw text every frame
      ctx.fillStyle = '#ffffff'
      ctx.font = '16px Arial'
      ctx.fillText(`Score: ${state.score}`, 10, 30)
      
      const fpsText = `FPS: ${fpsData.fps}`
      if (cachedFpsTextWidth.text !== fpsText) {
        cachedFpsTextWidth.value = ctx.measureText(fpsText).width
        cachedFpsTextWidth.text = fpsText
      }
      ctx.fillText(fpsText, canvas.width - cachedFpsTextWidth.value - 10, 30)

      if (!state.isGameOver) {
        animationId = requestAnimationFrame(draw)
      }
    }

    draw()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      cancelAnimationFrame(animationId)
      delete (window as any).dinoJump
    }
  }, []) // Remove all dependencies to prevent recreation

  const handleRestart = () => {
    setScore(0)
    setGameOver(false)
    const state = gameStateRef.current
    state.dino.y = 150
    state.dino.velocityY = 0
    state.dino.jumping = false
    state.obstacles = []
    state.frameCount = 0
    state.score = 0
    state.isGameOver = false
    state.lastFrameTime = performance.now()
    state.obstacleTimer = 0

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    
    const cachedFpsTextWidth = { value: 0, text: '' }

    const draw = () => {
      const currentTime = performance.now()
      const deltaTime = (currentTime - state.lastFrameTime) / 1000
      state.lastFrameTime = currentTime

      ctx.fillStyle = 'rgba(10, 14, 39, 0.7)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      state.frameCount++

      state.dino.velocityY += state.gravity * deltaTime
      state.dino.y += state.dino.velocityY * deltaTime

      if (state.dino.y >= state.ground - state.dino.height) {
        state.dino.y = state.ground - state.dino.height
        state.dino.velocityY = 0
        state.dino.jumping = false
      }

      ctx.fillStyle = '#b7ff00'
      ctx.fillRect(0, state.ground, canvas.width, 2)

      ctx.fillStyle = '#ff006e'
      ctx.fillRect(state.dino.x, state.dino.y, state.dino.width, state.dino.height)

      state.obstacleTimer += deltaTime
      if (state.obstacleTimer >= 2.17) {
        state.obstacles.push({
          x: canvas.width,
          y: state.ground - 30,
          width: 20,
          height: 30,
        })
        state.obstacleTimer = 0
      }

      ctx.fillStyle = '#00f5ff'
      for (let i = state.obstacles.length - 1; i >= 0; i--) {
        const obstacle = state.obstacles[i]
        obstacle.x -= state.targetSpeed * deltaTime

        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height)

        if (
          state.dino.x < obstacle.x + obstacle.width &&
          state.dino.x + state.dino.width > obstacle.x &&
          state.dino.y < obstacle.y + obstacle.height &&
          state.dino.y + state.dino.height > obstacle.y
        ) {
          state.isGameOver = true
          setGameOver(true)
        }

        if (obstacle.x + obstacle.width < 0) {
          state.score++
          state.obstacles.splice(i, 1)
        }
      }

      const fpsData = fpsRef.current
      fpsData.frames++
      const fpsCurrentTime = performance.now()
      const fpsDeltaTime = fpsCurrentTime - fpsData.lastTime
      
      if (fpsDeltaTime >= 1000) {
        fpsData.fps = Math.round((fpsData.frames * 1000) / fpsDeltaTime)
        fpsData.frames = 0
        fpsData.lastTime = fpsCurrentTime
      }

      ctx.fillStyle = '#ffffff'
      ctx.font = '16px Arial'
      ctx.fillText(`Score: ${state.score}`, 10, 30)
      
      const fpsText = `FPS: ${fpsData.fps}`
      if (cachedFpsTextWidth.text !== fpsText) {
        cachedFpsTextWidth.value = ctx.measureText(fpsText).width
        cachedFpsTextWidth.text = fpsText
      }
      ctx.fillText(fpsText, canvas.width - cachedFpsTextWidth.value - 10, 30)

      if (!state.isGameOver) {
        requestAnimationFrame(draw)
      }
    }

    draw()
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Game canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={300}
        className="border-4 border-primary"
        style={{ imageRendering: 'pixelated', backgroundColor: 'rgba(10, 14, 39, 0.7)' }}
      />

      <div className="text-center text-sm text-muted-foreground bg-background/80 backdrop-blur-sm rounded-lg p-4">
        {gameOver ? (
          <div className="space-y-2">
            <p className="text-lg font-bold text-foreground">Game Over!</p>
            <p className="text-md text-foreground">Score: {score} | Reps: {pushupCount}</p>
            <button
              onClick={handleRestart}
              className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              Play Again
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">Score: {score} | Reps: {pushupCount}</p>
            <p>Do pushups or squats to make the dino jump! (Spacebar also works for testing)</p>
          </div>
        )}
      </div>
    </div>
  )
}
