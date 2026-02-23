@echo off
setlocal

set BRANCH=%1
if "%BRANCH%"=="" set BRANCH=main

set COMMIT_MSG=%2
if "%COMMIT_MSG%"=="" set COMMIT_MSG=chore: sync cambios REGINSA QA

powershell -ExecutionPolicy Bypass -File "%~dp0git-push-both-repos.ps1" -Branch "%BRANCH%" -CommitMessage "%COMMIT_MSG%"

endlocal
