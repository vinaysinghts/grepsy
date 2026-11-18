# How feedback reaches the maintainer

- **In the app:** the **?** menu has *Known issues*, *Report a bug* and *Suggest a feature*. Bug reports open GitHub's issue form with the version and browser prefilled. No log content is ever sent.
- **Bugs → Issues:** blank issues are disabled, so every report uses `.github/ISSUE_TEMPLATE/bug_report.yml`. It has required steps, expected and actual results, and an "I searched existing issues" checkbox. New reports get `bug` and `needs-triage` labels.
- **Ideas → Discussions:** feature requests go to the Discussions *Ideas* category, where people upvote. Popular ideas get turned into issues. *(One-time setup: turn on Discussions in the repo settings.)*
- **Notifications:** GitHub emails the repo owner about new issues and discussions, and the GitHub mobile app pushes them. Watch the repo with "All activity" to get everything.
- **Triage:** label a report `needs-info` when details are missing. The *Issue triage* workflow closes it after 21 days with no reply. Close duplicates with "Close as duplicate of #N".
- **Spam waves:** Settings → Moderation → *Interaction limits* can temporarily restrict issues to prior contributors.
