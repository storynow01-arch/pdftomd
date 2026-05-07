# Git 基本操作指南

> 適用情境：Fork 協作開發，本機有多個 GitHub 帳號

---

## 🔄 多帳號切換（GitHub CLI）

```bash
# 查看目前所有已登入帳號與狀態
gh auth status

# 切換到 storynow02-tech（自己的 fork 帳號）
gh auth switch --user storynow02-tech

# 切換到 storynow01-arch（原作者帳號）
gh auth switch --user storynow01-arch

# 新增帳號（首次登入）
gh auth login --hostname github.com --web
```

---

## 📍 倉庫初始化

```bash
# 初始化新的 Git 倉庫
git init

# Clone 遠端倉庫到本機
git clone https://github.com/帳號/repo名稱.git

# 查看遠端倉庫設定
git remote -v
```

---

## 🌿 分支操作

```bash
# 查看所有分支（本地）
git branch

# 查看所有分支（包含遠端）
git branch -a

# 建立新分支
git branch 分支名稱

# 建立並切換到新分支（最常用）
git checkout -b 分支名稱

# 切換到已存在的分支
git checkout 分支名稱

# 刪除本地分支
git branch -d 分支名稱

# 強制刪除（未合併的分支）
git branch -D 分支名稱
```

---

## 📝 日常開發流程

```bash
# 1. 查看目前狀態（最常用）
git status

# 2. 查看檔案變更內容
git diff

# 3. 將檔案加入暫存區
git add 檔案名稱        # 單一檔案
git add .              # 所有變更

# 4. 提交 commit
git commit -m "說明文字"

# 5. Push 到遠端
git push origin 分支名稱

# 6. Pull 最新遠端內容
git pull origin 分支名稱
```

---

## 🔗 遠端倉庫管理

```bash
# 查看遠端設定
git remote -v

# 新增遠端（origin = 你的 fork，upstream = 原作者）
git remote add origin https://github.com/storynow02-tech/pdftomd.git
git remote add upstream https://github.com/storynow01-arch/pdftomd.git

# 從原作者倉庫同步最新內容
git fetch upstream
git merge upstream/main

# 刪除遠端設定
git remote remove upstream
```

---

## 📜 查看歷史紀錄

```bash
# 查看 commit 歷史
git log

# 精簡一行顯示
git log --oneline

# 圖形化顯示分支
git log --oneline --graph --all
```

---

## 🔁 Fork 協作完整流程

```
原作者 repo (upstream)
    ↓ fork
你的 fork (origin) → storynow02-tech/pdftomd
    ↓ clone
本機開發 → D:\antigravity\pdftomd_fork\pdftomd
    ↓ commit + push
你的 fork (origin)
    ↓ Pull Request
原作者 repo (upstream)
```

### 典型工作流程

```bash
# 1. 確認在正確帳號
gh auth status

# 2. 建立功能分支
git checkout -b feature/功能名稱

# 3. 開發、修改檔案...

# 4. 提交
git add .
git commit -m "feat: 新增某功能"

# 5. Push 到自己的 fork
git push origin feature/功能名稱

# 6. 去 GitHub 發 Pull Request
#    前往 https://github.com/storynow02-tech/pdftomd
#    點「Compare & pull request」
```

---

## ⚙️ 設定 Git 身份

```bash
# 查看全域設定
git config --global --list

# 設定全域身份
git config --global user.name "你的名字"
git config --global user.email "你的信箱"

# 只設定這個專案的身份（不影響全域）
git config user.name "storynow02-tech"
git config user.email "storynow02@gmail.com"

# 查看目前專案的設定
git config user.name
git config user.email
```

---

## 🚨 緊急救援

```bash
# 撤銷最後一次 commit（保留檔案變更）
git reset --soft HEAD~1

# 撤銷暫存區（回到 git add 之前）
git restore --staged 檔案名稱

# 捨棄工作區的變更（不可恢復！）
git restore 檔案名稱

# 暫存目前工作（切換分支用）
git stash
git stash pop   # 還原
```

---

*最後更新：2026-05-06*
