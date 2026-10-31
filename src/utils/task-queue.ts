// Added by an LLM agent (P0-4): previous version deadlocked on the first
// throwing task (running stayed true, queued promises never settled) and used
// O(n^2) shift(). This version uses try/finally, rejects the failing caller,
// keeps draining, and uses a head index instead of shift().
export default class TaskQueue {
  private running = false
  private queue: Array<{
    task: () => Promise<void> | void
    resolve: () => void
    reject: (e: unknown) => void
  }> = []
  private queueHead = 0
  private onFinished: () => void = () => {}

  async add(task: () => Promise<void> | void) {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ task, resolve, reject })
      if (!this.running) void this.run()
    })
  }

  setOnFinished(callback: () => void) {
    this.onFinished = callback
  }

  get length(): number {
    return this.queue.length - this.queueHead
  }

  clear() {
    // Reject pending callers so they never hang, then reset storage.
    for (let i = this.queueHead; i < this.queue.length; i++)
      this.queue[i].reject(new Error('TaskQueue cleared'))
    this.queue = []
    this.queueHead = 0
  }

  private async run() {
    this.running = true

    try {
      while (this.queueHead < this.queue.length) {
        const entry = this.queue[this.queueHead++]
        try {
          await entry.task()
          entry.resolve()
        } catch (e) {
          console.error('Advanced Canvas: TaskQueue task failed:', e)
          entry.reject(e)
        }

        // Periodically compact the backing array instead of shift()ing (O(n^2)).
        if (this.queueHead > 64 && this.queueHead * 2 > this.queue.length) {
          this.queue.splice(0, this.queueHead)
          this.queueHead = 0
        }
      }
    } finally {
      this.queue = []
      this.queueHead = 0
      this.running = false
      try { this.onFinished() } catch (e) { console.error('Advanced Canvas: TaskQueue onFinished failed:', e) }
    }
  }
}
