Connect the Dashboard screen to real Supabase data.
Remove all dummy/hardcoded application cards and stats.
Do not change any styling or layout.

---

1. FETCH ALL APPLICATIONS ON MOUNT

On component mount, run this query:

  const { data: applications, error } = await supabase
    .from('applications')
    .select('id, job_title, company, status, created_at, next_action_date, updated_at')
    .order('created_at', { ascending: false })

Store result in local state as applications array.
Show a skeleton shimmer in each kanban column while loading.

---

2. POPULATE KANBAN COLUMNS

Filter the applications array into 6 groups by status:

  const saved = applications.filter(a => a.status === 'saved')
  const applied = applications.filter(a => a.status === 'applied')
  const interviewScheduled = applications.filter(a => a.status === 'interview_scheduled')
  const interviewDone = applications.filter(a => a.status === 'interview_done')
  const offer = applications.filter(a => a.status === 'offer')
  const rejected = applications.filter(a => a.status === 'rejected')

Render each group in its corresponding kanban column.

Each card displays:
  - company name (bold, primary text)
  - job_title (secondary text, smaller)
  - status badge (coloured pill matching existing badge styles)
  - date applied: formatDate(created_at)
  - next_action_date if not null: show as amber pill "Action: DD MMM"
  - view icon button → navigates to /applications/[id]
  - delete icon button → see step 4

If a column has no applications show the existing empty 
state copy for that column.

---

3. STATS BAR

Calculate from the applications array:

  const total = applications.length

  const weekStart = new Date()
  weekStart.setHours(0,0,0,0)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const thisWeek = applications.filter(a => 
    new Date(a.created_at) >= weekStart
  ).length

  const interviewed = applications.filter(a => 
    ['interview_scheduled', 'interview_done'].includes(a.status)
  ).length
  const interviewRate = total > 0 
    ? Math.round((interviewed / total) * 100) 
    : 0

  const offers = applications.filter(a => a.status === 'offer').length
  const offerRate = total > 0 
    ? Math.round((offers / total) * 100) 
    : 0

Display in the stats bar:
  Total Applications: {total}
  This Week: {thisWeek}
  Interview Rate: {interviewRate}%
  Offer Rate: {offerRate}%

---

4. DRAG TO UPDATE STATUS

When a card is dragged to a new column:

  await supabase
    .from('applications')
    .update({ status: newStatus })
    .eq('id', applicationId)

Update local state immediately (optimistic update) so the 
UI moves the card without waiting for the database.

If the update fails, move the card back and show a red toast:
  "Failed to update status. Please try again."

Valid status values for each column:
  Saved → 'saved'
  Applied → 'applied'
  Interview Scheduled → 'interview_scheduled'
  Interview Done → 'interview_done'
  Offer → 'offer'
  Rejected → 'rejected'

---

5. DELETE APPLICATION

When the delete icon is clicked on a card:
  Show a confirmation: "Delete this application? This cannot 
  be undone."
  
  On confirm:
    await supabase
      .from('applications')
      .delete()
      .eq('id', applicationId)
  
  Remove card from local state immediately.
  Show green toast: "Application deleted"

  On error:
    Show red toast: "Failed to delete. Please try again."

---

6. REAL-TIME UPDATES (optional but recommended)

Subscribe to changes on the applications table so the board 
updates automatically if status changes from another tab:

  const channel = supabase
    .channel('applications-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'applications',
      filter: `user_id=eq.${user.id}`
    }, (payload) => {
      // Refetch applications on any change
      fetchApplications()
    })
    .subscribe()

  // Cleanup on unmount
  return () => supabase.removeChannel(channel)

---

7. EMPTY DASHBOARD STATE

If applications array is empty after loading, show the 
existing empty state for all columns plus a prompt in the 
centre of the board:
  "No applications yet"
  "Click New Application to get started"
  With a primary button linking to /new-application

---

REMOVE ALL DUMMY DATA
Remove every hardcoded application card, hardcoded stat 
number, and hardcoded company name currently in the dashboard.
All data must come from Supabase exclusively.