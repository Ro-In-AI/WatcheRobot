@echo off
REM Watcher Server 启动脚本 (Windows)

echo ========================================
echo   Watcher Server 启动脚本
echo ========================================
echo.

REM 检查conda是否可用
where conda >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到conda，请先安装Miniconda或Anaconda
    pause
    exit /b 1
)

REM 激活conda环境
echo [1/3] 激活conda环境: watcher-server...
call conda activate watcher-server
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 环境 watcher-server 不存在
    echo 请先运行: conda env create -f environment.yml
    pause
    exit /b 1
)

REM 检查 system.json
echo [2/3] 检查配置文件...
if not exist config\system.json (
    if exist config\system.example.json (
        echo [警告] config\system.json 不存在，从 config\system.example.json 复制...
        if not exist config mkdir config
        copy config\system.example.json config\system.json >nul
        echo [提示] 请按需编辑 config\system.json 与其它 config\*.json 文件
    ) else (
        echo [错误] 未找到 config\system.json，且缺少 config\system.example.json
        pause
        exit /b 1
    )
)

REM 启动服务
echo [3/3] 启动服务...
echo.
python main.py

REM 服务结束后暂停
echo.
echo 服务已停止
pause
