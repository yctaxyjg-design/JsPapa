-- mail_rule_save_korea_attachments.applescript
-- Apple Mail rule script: yctaxyjg@korea.kr 발신 메일의 첨부파일을
-- iCloud Drive/작업파일/_incoming 폴더에 자동 저장
--
-- 사용법:
--   1. Mail.app > 환경설정 > 규칙 에서 새 규칙 생성
--   2. 조건: "보낸 사람"이 "yctaxyjg@korea.kr"인 경우
--   3. 동작: "AppleScript 실행" → 이 스크립트 선택

using terms from application "Mail"
    on perform mail action with messages theMessages for rule theRule
        -- 저장 경로: iCloud Drive/작업파일/_incoming
        set destFolder to (path to home folder as text) & "Library:Mobile Documents:com~apple~CloudDocs:작업파일:_incoming:"

        -- _incoming 폴더가 없으면 생성
        tell application "Finder"
            if not (exists folder destFolder) then
                do shell script "mkdir -p " & quoted form of POSIX path of destFolder
            end if
        end tell

        repeat with aMessage in theMessages
            set attachmentList to mail attachments of aMessage

            repeat with anAttachment in attachmentList
                set attachName to name of anAttachment
                set savePath to destFolder & attachName

                try
                    save anAttachment in file savePath
                    log "Saved attachment: " & attachName
                on error errMsg
                    log "Error saving " & attachName & ": " & errMsg
                end try
            end repeat
        end repeat
    end perform mail action with messages
end using terms from
