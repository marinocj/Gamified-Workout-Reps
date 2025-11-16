'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Activity, ArrowLeft, Calendar, Clock, TrendingUp, Trash2 } from 'lucide-react'
import { WorkoutStorage, type WorkoutSession } from '@/lib/workout-storage'

export default function HistoryPage() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalReps: 0,
    favoriteExercise: null as string | null,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    setSessions(WorkoutStorage.getSessions())
    setStats(WorkoutStorage.getStats())
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this session?')) {
      WorkoutStorage.deleteSession(id)
      loadData()
    }
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
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

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Session History</h1>
          <p className="mt-2 text-muted-foreground">
            Track your progress and review past gaming sessions
          </p>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.totalWorkouts}</p>
                <p className="text-sm text-muted-foreground">Total Sessions</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                <TrendingUp className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.totalReps}</p>
                <p className="text-sm text-muted-foreground">Total Reps</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-4/10">
                <Activity className="h-6 w-6 text-chart-4" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">
                  {stats.favoriteExercise || 'None'}
                </p>
                <p className="text-sm text-muted-foreground">Favorite Game</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Workout List */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-foreground">Recent Sessions</h2>
          
          {sessions.length === 0 ? (
            <div className="mt-6 rounded-lg border border-border bg-muted/30 p-12 text-center">
              <Activity className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                No session history yet. Start your first game!
              </p>
              <Link href="/minigames">
                <Button className="mt-4">Play Games</Button>
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-foreground">{session.exerciseName}</h3>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(session.date)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(session.duration)}
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {session.reps} reps
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(session.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
