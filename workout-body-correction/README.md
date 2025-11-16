# FormFit - Exercise Through Gaming - a HackRPI 2025 Project

An interactive fitness application that transforms workouts into engaging gaming experiences. Play retro games controlled by your exercise movements!

This project was created by Adam Choi, Andrew Wang, Martin Zheng, and Margie Cao

## Features

- **🎯 Breakout Game**: Control the paddle with weight lifting movements (up/down)
- **🦖 Dino Jump**: Make the dino jump with lateral raises

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- `/app` - Next.js app router pages
  - `/minigames` - Game selection and gameplay
  - `/history` - Session history and statistics
- `/components/games` - Game implementations (Breakout, Dino)
- `/lib` - Utilities and storage

## Available Games

### Breakout
- **Control**: Use arrow keys ↑↓ (or weight lifting movements)
- **Objective**: Break all the bricks without losing lives
- **Features**: Powerups (extra lives, bigger paddle)

### Dino Jump
- **Control**: Use spacebar (or lateral raises)
- **Objective**: Jump over obstacles and survive as long as possible
- **Features**: Increasing difficulty, score tracking
