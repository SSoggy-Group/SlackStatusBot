
## Entry 13
- ID: 13
- Author: SSoggyTacoMan
- Created At: 2026-06-04T10:14:00+02:00

### Content
# adding last.fm support

**Hours:** 2 hours

spotify oauth is honestly kind of a nightmare and i wanted a fallback option in case people didn't want to go through all that linking. decided to add last.fm support. the cool thing about last.fm is that recently played tracks are totally public data so long as your profile isn't private. meaning i could completely skip the whole oauth flow and just add a text box for the username.

the only tricky part was that the slack App Home UI didn't refresh when i first added the username, because i forgot to call the UI update function in the action handler. stared at it for a solid 10 minutes trying to figure out why the customization menu wasn't appearing after i pressed enter. fixed the bug and added a radio button toggle so you can choose which data source to prioritize (spotify or last.fm) if you have both connected.
