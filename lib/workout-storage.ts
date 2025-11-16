'use client'

export interface WorkoutSession {
  id: string
  exerciseId: string
  exerciseName: string
  date: Date
  duration: number // seconds
  reps: number
  avgFormScore: number
  feedbackSummary: {
    good: number
    warning: number
    error: number
  }
}

const STORAGE_KEY = 'formfit_workout_history'

export class WorkoutStorage {
  static saveSession(session: Omit<WorkoutSession, 'id' | 'date'>): void {
    const sessions = this.getSessions()
    const newSession: WorkoutSession = {
      ...session,
      id: crypto.randomUUID(),
      date: new Date(),
    }
    sessions.unshift(newSession)
    
    // Keep only last 50 sessions
    const trimmed = sessions.slice(0, 50)
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    }
  }

  static getSessions(): WorkoutSession[] {
    if (typeof window === 'undefined') return []
    
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    
    try {
      const sessions = JSON.parse(data)
      // Convert date strings back to Date objects
      return sessions.map((s: any) => ({
        ...s,
        date: new Date(s.date),
      }))
    } catch {
      return []
    }
  }

  static getSessionsByExercise(exerciseId: string): WorkoutSession[] {
    return this.getSessions().filter((s) => s.exerciseId === exerciseId)
  }

  static deleteSession(id: string): void {
    const sessions = this.getSessions()
    const filtered = sessions.filter((s) => s.id !== id)
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    }
  }

  static clearAll(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  static getStats() {
    const sessions = this.getSessions()
    
    if (sessions.length === 0) {
      return {
        totalWorkouts: 0,
        totalReps: 0,
        avgFormScore: 0,
        favoriteExercise: null,
      }
    }

    const totalReps = sessions.reduce((sum, s) => sum + s.reps, 0)
    const avgFormScore = Math.round(
      sessions.reduce((sum, s) => sum + s.avgFormScore, 0) / sessions.length
    )

    // Find most common exercise
    const exerciseCounts: Record<string, number> = {}
    sessions.forEach((s) => {
      exerciseCounts[s.exerciseName] = (exerciseCounts[s.exerciseName] || 0) + 1
    })
    const favoriteExercise = Object.entries(exerciseCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

    return {
      totalWorkouts: sessions.length,
      totalReps,
      avgFormScore,
      favoriteExercise,
    }
  }
}
