interface Env {
  DB: D1Database
}

const CLEANUP_CONFIG = {
  // Whether to delete expired emails
  DELETE_EXPIRED_EMAILS: true,
  
  // Batch processing size
  BATCH_SIZE: 100,
} as const 

const main = {
  async scheduled(_: ScheduledEvent, env: Env) {
    const now = Date.now()

    try {
      if (!CLEANUP_CONFIG.DELETE_EXPIRED_EMAILS) {
        console.log('Expired email deletion is disabled')
        return
      }

      const expired = await env.DB
        .prepare(`SELECT id FROM email WHERE expires_at < ? ORDER BY expires_at ASC LIMIT ?`)
        .bind(now, CLEANUP_CONFIG.BATCH_SIZE)
        .all<{ id: string }>()
      const ids = expired.results.map((row: { id: string }) => row.id)
      if (ids.length === 0) return

      const placeholders = ids.map(() => '?').join(', ')
      const result = await env.DB.batch([
        env.DB.prepare(`DELETE FROM message WHERE source = 'temporary' AND "emailId" IN (${placeholders})`).bind(...ids),
        env.DB.prepare(`DELETE FROM email WHERE id IN (${placeholders})`).bind(...ids),
      ])

      const deleteResult = result[1]
      console.log(`Deleted ${deleteResult?.meta?.changes ?? 0} expired temporary mailboxes and their associated messages`)
    } catch (error) {
      console.error('Failed to cleanup:', error)
      throw error
    }
  }
}

export default main
