import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Activity, Gamepad2, TrendingUp } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-foreground">FormFit</span>
            </div>
            <nav className="flex items-center gap-6">
              <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Features
              </Link>
              <Link href="#games" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Games
              </Link>
              <Link href="/minigames" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Play Now
              </Link>
              <Link href="/history" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                History
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-balance text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Exercise Through Gaming
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Play retro games powered by your workout movements. Make exercise fun with interactive minigames that track your progress and keep you motivated.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/minigames">
              <Button size="lg" className="h-12 px-8">
                Start Playing
              </Button>
            </Link>
            <Link href="/history">
              <Button size="lg" variant="outline" className="h-12 px-8">
                View History
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-t border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-foreground">How It Works</h2>
            <p className="mt-4 text-muted-foreground">
              Turn your workouts into engaging game sessions
            </p>
          </div>
          
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Gamepad2 className="h-8 w-8" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-foreground">Interactive Games</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Play classic games like Breakout and Dino Jump controlled by your exercise movements
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Activity className="h-8 w-8" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-foreground">Exercise Control</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Control games with exercises like lateral raises, squats, and arm movements
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-chart-2 text-white">
                <TrendingUp className="h-8 w-8" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-foreground">Track Progress</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Monitor your workout sessions and scores over time with detailed history
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Games Section */}
      <section id="games" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-foreground">Available Games</h2>
            <p className="mt-4 text-muted-foreground">
              Choose your favorite game to start exercising
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:max-w-4xl lg:mx-auto">
            <div className="rounded-lg border border-border bg-card p-6 transition-colors hover:bg-muted/50">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-lg font-semibold text-foreground">Breakout</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Control the paddle with weight lifting movements (up/down)
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-6 transition-colors hover:bg-muted/50">
              <div className="text-4xl mb-4">🦖</div>
              <h3 className="text-lg font-semibold text-foreground">Dino Jump</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Jump with lateral raises to dodge obstacles
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>FormFit - Exercise through gaming</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
