' 금옥이 조용히 켜기 — 콘솔창 없이 Electron 앱 실행
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\User\Desktop\PROJECTS\geumoki"
' 0 = 창 숨김, False = 기다리지 않고 바로 반환
sh.Run "cmd /c npm start", 0, False
