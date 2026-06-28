# demo.tape — regenerate the README demo with VHS:
#   1. install VHS once:  https://github.com/charmbracelet/vhs  (e.g. `winget install charmbracelet.vhs`)
#   2. make sure `init-claude` is on PATH
#   3. run:  vhs demo.tape   → writes assets/demo.gif
#
# This records the safe, deterministic commands (version + doctor). To record the
# full interactive wizard instead, replace the block below with key presses, e.g.:
#   Type "init-claude"  Enter  Sleep 2s
#   Down  Sleep 400ms  Enter           # pick a mode
#   Space Sleep 300ms  Down  Space     # toggle components
#   Enter ...                          # confirm each step

Output assets/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1120
Set Height 660
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 55ms

Hide
Type "clear" Enter
Show

Sleep 600ms
Type "init-claude --version"
Sleep 400ms
Enter
Sleep 1400ms

Type "init-claude check"
Sleep 400ms
Enter
Sleep 5s
