#!/bin/zsh
# Double-click in Finder to start the Streamlit Web UI (opens Terminal + browser).
cd "$(dirname "$0")" || exit 1
exec /Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3.9 -m streamlit run app.py
