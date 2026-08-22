!macro NSIS_HOOK_POSTINSTALL
  ; Refresh Explorer's cached executable/shortcut icons after an in-place update.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
