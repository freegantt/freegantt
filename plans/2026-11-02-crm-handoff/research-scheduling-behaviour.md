# Research: scheduling behaviour in Microsoft Project, Primavera P6 and Syncify

Date: 2026-11-02. Purpose: input for five design decisions (Q3, Q4, Q5, Q6, Q8).

## Sources and method

- Microsoft Project: support.microsoft.com, learn.microsoft.com (docs and Q&A), Microsoft Tech Community blogs.
- Primavera P6: docs.oracle.com (P6 Professional and P6 EPPM help). Planning Planet forum where Oracle docs are silent.
- Syncify: the product is at https://www.syncify.com. Its docs are at https://docs.syncify.com. It is a browser-based construction CPM scheduler. It imports P6 XER and Microsoft Project files. I read the docs through the Orca embedded browser. I did not open the app itself.
- "Project for the web" is now part of Planner premium plans. Its public docs are thin. Many web answers below are "not verified".
- "Inferred" means the docs state the rules, and I derived the result from those rules. I did not test it in the product.

---

## Q3. Predecessor moves earlier. Does the successor follow?

### Microsoft Project (desktop)

- Auto-scheduled tasks follow their links. With the default As Soon As Possible (ASAP) constraint, the successor moves earlier too ("push and pull").
  - "In nearly all cases, use the As Soon As Possible (ASAP) constraint. This is the default constraint for tasks when you schedule from the project start date." https://support.microsoft.com/en-us/project/how-project-schedules-tasks-behind-the-scenes
- A Start No Earlier Than (SNET) constraint stops the pull. "If a task has a SNET constraint set to July 1, the task is tied to that date and won't be rescheduled to an earlier date, even if its predecessor finishes on June 28." https://support.microsoft.com/en-us/project/link-tasks-in-a-project
- Manually scheduled tasks do not follow. "If the predecessor later changes its finish date, the successor's start date will remain unchanged." https://support.microsoft.com/en-us/project/how-project-schedules-tasks-behind-the-scenes
- Controls: Task Mode (Auto / Manual), constraint type, and File > Options > Schedule > Calculation On/Off. With calculation off, Project recalculates only on F9. https://learn.microsoft.com/en-us/office/troubleshoot/project/tasks-not-scheduled
- No separate "push only" mode. The SNET constraint that a typed date creates gives push-only behaviour per task, as a side effect.

### Project for the web / Planner premium

- One forum thread shows FS links pull start dates once logged work is removed: "Once I removed the completed hours, it then pulled the start dates to what were defined from the dependencies." (user self-answer) https://learn.microsoft.com/en-za/answers/questions/5760974/project-for-the-web-planner-dependency-not-enforci
- No manual/auto mode is visible in the web product (same thread).
- Whether a successor moves earlier when its predecessor moves earlier: **not verified**.

### Primavera P6

- P6 is a pure CPM engine. Each schedule run (F9) recomputes early dates from logic. An unconstrained successor moves earlier. (Inferred from the forward-pass definition below.)
- Setting: "Schedule automatically when a change affects dates — Mark to calculate the schedule each time a significant change is made to an activity, relationship, or resource. If you clear this checkbox, changes to activities are reflected in the schedule after you calculate the schedule." https://docs.oracle.com/cd/E90748_01/client_help/en_US/general_tab_-_schedule_options_dialog_box.htm
- Retained Logic / Progress Override / Actual Dates do not control this case. They apply only to activities with progress: "When you choose Retained Logic, the remaining duration of a progressed activity is not scheduled until all predecessors are complete. When you choose Progress Override, network logic is ignored and the activity can progress without delay." (same URL)
- A Start On or After constraint stops the pull. "Primavera won't allow it to start any earlier than the constraint date, even if the predecessor relationships say it could." (forum) https://planningplanet.com/forums/primavera-version-pm5-pm6/539449/start-start-relationship-predecessor-stops-enforcing-success
- No "push only" mode.

### Syncify

- Pure CPM. "The initial Early Start is the latest of: Status Date; incoming start-side relationship deadlines; Start On or After and equivalent start floors." So an unconstrained successor moves earlier. https://docs.syncify.com/cpm-calculation/
- Setting: Schedule Automatically. "When Schedule Automatically is enabled, supported scheduling edits trigger calculation as you work. With it disabled, edit the inputs and run Calculate when you are ready to update the forecast." https://docs.syncify.com/calculation/
- Calculation modes (Retained Logic, Progress Override, Actual Dates, Retained Duration) apply to progressed work only. https://docs.syncify.com/cpm-calculation/
- No "push only" mode found.

---

## Q4. User sets a successor date that breaks a dependency

### Microsoft Project (desktop)

- Typing a date sets a constraint. "Whenever you manually enter a Start date for a task, the software automatically adds a Start No Earlier Than constraint. Whenever you manually enter a Finish date for a task, the software automatically adds a Finish No Earlier Than constraint." (Microsoft Q&A answer) https://learn.microsoft.com/en-us/answers/questions/5099124/constraint-type-constraint-date
- Drawing a task on the Gantt chart also sets SNET. https://support.microsoft.com/en-us/project/link-tasks-in-a-project
- SNET is only a floor. If the typed date is before the predecessor finish, the link still drives. The task lands after the predecessor. (Inferred from the SNET definition.)
- Manually scheduled task: Project accepts the date. It shows a red squiggle, "Potential scheduling problem". The right-click menu offers "Fix in Task Inspector", "Respect Links", and "Ignore problems for this task". (Third-party tutorials; no support.microsoft.com page found.) https://www.dummies.com/article/technology/software/microsoft-products/project/handle-project-2016-task-warnings-suggestions-223262/
- "Respect Links" moves the task to obey its predecessor and keeps it manual. https://learn.microsoft.com/en-us/answers/questions/4771653/update-manually-scheduled-tasks-when-editing-links
- Planning Wizard warns when an inflexible constraint conflicts with a link. (Book excerpt, not Microsoft.) https://flylib.com/books/en/4.352.1.67/1/

### Project for the web / Planner premium

- **Not verified.** An AI answer on Microsoft Q&A says typed dates are "fixed". The poster's own fix contradicts it. I did not treat it as a source.

### Primavera P6

- P6 EPPM: "You can apply up to two constraints to activities in the Status detail window of the Activities page, or by dragging the start or end of a bar in the Gantt view." https://docs.oracle.com/cd/F51301_01/English/User_Guides/p6_eppm_user/6613.htm
- Changing the start of a not-started activity adds a Start On or After constraint. "If you choose to change the planned start date of an activity without modifying the logic, Primavera P6 will assume that you want it constrained and assign a constraint to it." (third party) https://planningengineer.net/understanding-constraints-in-primavera-p6/
- Start On or After is a floor: "P6 imposes the start on or after constraint in the forward pass only if the calculated early start date will be earlier than the imposed date." https://docs.oracle.com/cd/E80666_01/English/User_Guides/p6_eppm_user/6673.htm
- Result: a date before the predecessor finish snaps back to the logic date at the next schedule run. (Inferred.)
- No Oracle page states the auto-constraint on typed start dates. That part is **not verified** against Oracle docs.

### Syncify

- "A future start edit on a not-started activity updates a start-side constraint, normally Start On or After when no suitable constraint exists." https://docs.syncify.com/activities-and-wbs/
- "A future finish edit on an incomplete ordinary activity can update its duration."
- "A date entered on or before the status-date boundary can be treated as an actual date."
- "Moving or resizing a timeline bar can make equivalent scheduling changes."
- Start On or After is a floor in the forward pass. So the activity snaps back after its predecessor on calculation. (Inferred from https://docs.syncify.com/cpm-calculation/.)
- No reject and no conflict flag for this case found.

---

## Q5. Lag units

### Microsoft Project (desktop)

- Lag is a duration or a percent of the predecessor duration. "To add lead time, type a negative number or a negative percentage (for example, -50%). To add lag time, type a positive number or positive percentage (for example, 2d)." https://support.microsoft.com/en-us/project/add-lead-or-lag-time-to-a-task
- Units: minutes, hours, days, weeks, months. Each has an elapsed form with an "e" prefix (for example "4ed", "1emon"). Elapsed time ignores non-working time. https://learn.microsoft.com/en-us/answers/questions/4940032/ms-project-purpose-of-50e-as-lag-time-in-task
- Elapsed percent exists too ("50e%"). Same URL.
- A month is a fixed count of working days, not a calendar month. "The default definition is 20 days and can only be set once per project." (Days per month option.) https://learn.microsoft.com/en-us/answers/questions/4778434/ms-project-what-is-a-month
- An elapsed month is 30 calendar days. Source is third-party and forum posts only: https://blog.epmainc.com/more-you-want-know-about-duration-everything-you-need-know/ . Microsoft text: **not verified**.

### Project for the web / Planner premium

- "You can also add lead and lag times through the same menu in days, hours, minutes, weeks or months." Shortcode form: "3FS+10d". https://techcommunity.microsoft.com/blog/plannerblog/advanced-project-planning-with-microsoft-planner-dependencies-and-critical-path-/4168235
- Elapsed and percent lag: **not verified**. How a month is computed: **not verified**.

### Primavera P6

- Lag is a time value. P6 stores durations in hours. It converts other units with hours per day/week/month/year. The conversion comes from Admin Preferences, or from the assigned calendar when "Use assigned calendar to specify the number of work hours for each time period" is on. https://www.proove.eu/knowledge/primavera-p6-duration-issues-hours-per-time-period-explained (third party). Oracle calendar page mentions the Time Periods setting: https://docs.oracle.com/cd/G18296_01/English/User_Guides/p6_pro_user/edit_a_project_calendar.htm
- A month lag is therefore "hours per month" working hours, not a calendar month.
- Lag calendar is one project-wide choice: Successor Activity Calendar (default), Predecessor Activity Calendar, 24 Hour Calendar, or Project Default Calendar. "If you do not select a calendar, Successor Activity Calendar is used to calculate lag." https://docs.oracle.com/cd/E90748_01/client_help/en_US/general_tab_-_schedule_options_dialog_box.htm
- The 24 Hour Calendar option is the nearest thing to elapsed lag. It applies to all links, not one.
- Percent lag: no Oracle doc mentions it. Treat as unsupported, **not verified**.

### Syncify

- "Syncify measures relationship lag on the predecessor activity's calendar. ... A two-day working lag is not necessarily 48 elapsed hours." https://docs.syncify.com/relationships/
- Calculation runs "at one-minute resolution". Each calendar holds "minutes-per-day, week, month, and year conversion values". So a month lag is a fixed count of working minutes from the calendar. (Inferred.) https://docs.syncify.com/cpm-calculation/
- Percent lag is not stored: "Percent lag is converted to a fixed duration during import: fixed lag = predecessor total duration × imported lag percentage." https://docs.syncify.com/microsoft-project-compatibility/
- Elapsed lag is not kept: "Elapsed-time lag does not retain elapsed-calendar behavior; it is treated as working-time lag." (same URL)
- P6 lag on the successor or project calendar is listed as unsupported. https://docs.syncify.com/p6-compatibility/
- Units the user can type in the lag field: **not verified** (app not opened).

---

## Q6. Engine wants to move a date the user pinned

### Microsoft Project (desktop)

- Manually scheduled task: the task wins. "You can place a manually scheduled task anywhere in your schedule, and Project won't move it." https://support.microsoft.com/en-us/project/how-project-schedules-tasks-behind-the-scenes
  - The conflict shows as a red squiggle and in the Task Inspector (see Q4).
- Must Start On / Must Finish On: the constraint wins by default. "In Microsoft Project, the Task will always honor their constraint dates setting overrides the task relationship links." https://learn.microsoft.com/en-us/office/troubleshoot/project/tasks-not-scheduled
  - The conflict shows as negative slack. "Negative slack can occur ... Negative slack will even further constrain the end date of your project." https://support.microsoft.com/en-us/project/how-project-schedules-tasks-behind-the-scenes
  - Turn the option off and links win. Project then shows a "Missed Constraint" indicator. (Book excerpt.) https://flylib.com/books/en/4.352.1.67/1/
  - The Planning Wizard warns when you create the conflict, if Show Scheduling Messages is on. https://learn.microsoft.com/en-us/office/troubleshoot/project/tasks-not-scheduled
- Actual progress wins over everything. Recorded progress stops the task moving. (Same troubleshooting page, items 5 and 6.)

### Project for the web / Planner premium

- Recorded work pins the task: "once progress is recorded on a task ... the scheduling engine cannot move the start of that work to a future date based on a dependency." (Microsoft moderator) https://learn.microsoft.com/en-za/answers/questions/5760974/project-for-the-web-planner-dependency-not-enforci
- Constraint types and conflict reporting: **not verified**.

### Primavera P6

- Mandatory constraints win. "P6 uses the mandatory early start date regardless of its effect on network logic." https://docs.oracle.com/cd/E80666_01/English/User_Guides/p6_eppm_user/6673.htm
- "A hard constraint prevents activities from being moved. In P6, the hard constraints available are Mandatory Start and Mandatory Finish. A soft constraint does not prevent activities from being moved, but it can distort float." https://docs.oracle.com/cd/F51301_01/English/User_Guides/p6_eppm_user/6613.htm
- Start On is soft: it "can delay an activity's early start or move forward an activity's late start". Logic still wins on the early side. https://docs.oracle.com/cd/E80666_01/English/User_Guides/p6_eppm_user/6673.htm
- Reporting: the schedule log. Its Exceptions section counts "activities with unsatisfied constraints" and "activities with unsatisfied relationships". https://docs.oracle.com/cd/F88966_01/p6help/en/99352.htm
- Its Warnings section lists out-of-sequence activities. https://docs.oracle.com/cd/F74773_01/p6help/en/99350.htm
- Negative total float also shows the conflict (standard CPM behaviour, consistent with Syncify's P6 notes).

### Syncify

- Mandatory wins. "Mandatory Start: hard-sets Early Start and Late Start, then calculates the finish from duration." https://docs.syncify.com/cpm-calculation/
- Soft "On" constraints lose to logic. "Start On and Finish On remain logic-sensitive: they can produce negative float rather than overriding the network. Mandatory constraints override the corresponding network endpoint." (same URL)
- Reporting: negative float, the critical display, the Quality panel, and driving-path tracing. "Hard overrides can produce a bar at the required date even when the network tells a more complicated story." https://docs.syncify.com/relationships/
- Actual dates win: "Ordinary recalculation preserves them." https://docs.syncify.com/calculation/
- No manual-scheduling mode. Imported Microsoft Project manual tasks become Start On or After, so "recalculation will not move it earlier than the imported manual start". Logic can still push them later. https://docs.syncify.com/microsoft-project-compatibility/

---

## Q8. Holidays and non-working time

### Microsoft Project (desktop)

- Entry: Project > Change Working Time > Exceptions tab. "Use the Exceptions tab to add holidays to your schedule." https://support.microsoft.com/en-us/project/set-the-general-working-days-and-times-for-a-project
- An exception has a start and finish date (a range). Details sets non-working, or custom working times, and a recurrence pattern: daily, weekly, monthly or yearly, with a range of recurrence. (Third-party walk-through; the Microsoft "Add a holiday" page returned 404.) https://www.dalehowardmvp.com/add-company-holidays/
- Work Weeks tab sets dated periods with different weekly hours. (Microsoft page above.)
- Calendars: project calendar, task calendar, resource calendar. "When you add a resource to a task, the resource calendar controls the scheduling of the task." A task calendar can be set to ignore resource calendars. Otherwise "the task is scheduled for the overlapping working time of the two calendars." https://support.microsoft.com/en-us/project/how-project-schedules-tasks-behind-the-scenes

### Project for the web / Planner premium

- Non-working time comes from a work hours template. It "contains details about work hours per day, days off, and any other business closures." https://learn.microsoft.com/en-us/project-for-the-web/create-and-apply-a-work-calendar
- "You associate a work template to the project calendar to apply the schedule for the project." Templates are built from resource calendars in Dynamics 365. (same URL)
- Per project and per resource. Not per task: a forum user notes templates change "only in project details, not per task". https://learn.microsoft.com/en-us/answers/questions/5180367/challenges-to-create-and-apply-work-calendars-in-p
- Recurring holidays and partial days: **not verified**.

### Primavera P6

- Calendar types: global, project, resource. Activities get a global or project calendar. Resource calendars apply to resources. https://consultleopard.com/calendars-in-primavera-p6/ (third party); P6 EPPM calendar page: https://docs.oracle.com/cd/F51301_01/English/User_Guides/p6_eppm_user/44174.htm
- Entry is per date: "To add a nonworkday, click the date you want to make a nonworkday, then click Nonwork." https://docs.oracle.com/cd/G18296_01/English/User_Guides/p6_pro_user/edit_a_project_calendar.htm
- Partial days: "Choose Detailed work hours/day to define which hours of the day are work or nonwork hours." (same URL)
- Inheritance: a project calendar can "Inherit Holidays and Exceptions from Global Calendar". (same URL)
- Recurring exceptions: the Oracle page shows none. Only a bulk click on a weekday column for the shown month. Recurring: **not verified / likely absent**.
- Resource-dependent activities use resource calendars; task-dependent activities use the activity calendar (Syncify's P6 notes confirm this split).

### Syncify

- Entry: "Open Exceptions to set dates that differ from the normal week. Use a nonworking exception for a holiday or shutdown, and custom working hours for an exceptional workday or shortened shift." https://docs.syncify.com/calendars/
- Partial days: each working day has one or more work periods, for example "08:00–12:00 and 13:00–17:00". (same URL)
- Calendars are per activity, with a schedule default. "An activity's assigned calendar controls its working time." (same URL)
- Calendars are reusable assets at workspace scope. "A workspace calendar can serve many projects." (same URL)
- "Resource calendars do not override activity calendars or drive task dates in Syncify." (same URL)
- Imported recurring exceptions are expanded to fixed dates: "Supported recurring exceptions are expanded over a bounded planning horizon extending 20 years beyond the imported schedule finish." https://docs.syncify.com/microsoft-project-compatibility/
- Native UI for date ranges and recurrence: **not verified**.

---

## Summary table

| Question | Microsoft Project (desktop) | Project for the web | Primavera P6 | Syncify |
|---|---|---|---|---|
| Q3 Predecessor earlier | Auto + ASAP successor moves earlier (push and pull). Manual tasks and SNET stay. No push-only mode. | Links pull dates (forum). Move-earlier: not verified. | Successor moves earlier on each schedule run. "Schedule automatically" option. Retained Logic only affects progressed work. No push-only mode. | Successor moves earlier (CPM forward pass). "Schedule Automatically" option. No push-only mode. |
| Q4 Date breaks a link | Typed or drawn date sets SNET/FNET; logic still wins. Manual task: accepted, red squiggle, "Respect Links". | Not verified. | Drag or typed start sets Start On or After; logic wins on next run (Oracle wording on typing not verified). | Future start edit sets Start On or After; logic wins on calculation (inferred). Past date becomes an actual. |
| Q5 Lag units | Min/hr/day/wk/month, elapsed "e" forms, percent and elapsed percent. Month = 20 working days by default. | Minutes to months. Elapsed, percent, month rule: not verified. | Time only, stored in hours. Month = hours-per-month setting. One lag calendar for all links (successor default; 24-hour option). Percent: not verified. | Working time on predecessor calendar, minute resolution. Percent and elapsed lag converted to fixed working lag on import. |
| Q6 Pinned vs engine | Manual task wins, flagged. Must-on wins by default ("honor constraint dates"), shown as negative slack. Actuals win. | Logged work pins the task. Rest not verified. | Mandatory wins; soft "On" loses to logic. Schedule log counts unsatisfied constraints; negative float. | Mandatory wins; Start On / Finish On yield negative float. Actuals win. No manual mode. |
| Q8 Holidays | Exceptions: date range, non-working or custom hours, daily/weekly/monthly/yearly recurrence. Project, task, resource calendars. | Work hours template from Dynamics 365. Per project and resource, not per task. Details not verified. | Per-date Nonwork click; detailed hours per day; inherit from global calendar. Global, project, resource calendars. Recurrence: not verified. | Exceptions: non-working or custom hours; split work periods. Per-activity calendars, workspace assets. Resource calendars do not drive dates. Ranges/recurrence in UI: not verified. |
