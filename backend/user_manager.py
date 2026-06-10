import os
import json
import hashlib
import secrets
from pathlib import Path
from typing import List, Dict, Any, Optional

DATA_DIR = Path(__file__).parent / "data"
USERS_FILE = DATA_DIR / "users.json"
SECRET_FILE = DATA_DIR / "secret_key.txt"

class UserManager:
    def __init__(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._init_secret_key()
        self._init_users()

    def _init_secret_key(self):
        """Initialize or load a persistent secret key for token signatures."""
        if not SECRET_FILE.exists():
            secret = secrets.token_hex(32)
            with open(SECRET_FILE, "w", encoding="utf-8") as f:
                f.write(secret)
            self.secret_key = secret
        else:
            with open(SECRET_FILE, "r", encoding="utf-8") as f:
                self.secret_key = f.read().strip()

    def _init_users(self):
        """Initialize users database with a default admin account if empty."""
        if not USERS_FILE.exists():
            self._save_users([])
        
        users = self._load_raw_users()
        if len(users) == 0:
            # Seed super admin
            salt = secrets.token_hex(16)
            admin_hash = self._hash_password("admin123", salt)
            admin_user = {
                "username": "admin",
                "password_hash": admin_hash,
                "salt": salt,
                "role": "admin",
                "display_name": "超级管理员"
            }
            users.append(admin_user)
            self._save_users(users)

    def _load_raw_users(self) -> List[Dict[str, Any]]:
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save_users(self, users: List[Dict[str, Any]]):
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2, ensure_ascii=False)

    def _hash_password(self, password: str, salt: str) -> str:
        return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()

    def register_user(self, username: str, password: str, display_name: str) -> Dict[str, Any]:
        """Register a new regular user. Super admins cannot be registered."""
        username = username.strip().lower()
        if not username or not password:
            raise ValueError("用户名和密码不能为空！")
        
        if username == "admin":
            raise ValueError("不能注册超级管理员账号！")

        users = self._load_raw_users()
        if any(u["username"] == username for u in users):
            raise ValueError(f"用户名 '{username}' 已存在！")

        salt = secrets.token_hex(16)
        password_hash = self._hash_password(password, salt)

        new_user = {
            "username": username,
            "password_hash": password_hash,
            "salt": salt,
            "role": "user",
            "display_name": display_name.strip() or username
        }

        users.append(new_user)
        self._save_users(users)

        return {
            "username": new_user["username"],
            "role": new_user["role"],
            "display_name": new_user["display_name"]
        }

    def authenticate_user(self, username: str, password: str) -> Dict[str, Any]:
        """Verify credentials and return user info + session token."""
        username = username.strip().lower()
        users = self._load_raw_users()
        user = next((u for u in users if u["username"] == username), None)

        if not user:
            raise ValueError("用户名或密码错误！")

        input_hash = self._hash_password(password, user["salt"])
        if input_hash != user["password_hash"]:
            raise ValueError("用户名或密码错误！")

        # Generate a stateless signed token
        # format: username.role.signature
        token = self.generate_token(user["username"], user["role"])

        return {
            "token": token,
            "username": user["username"],
            "role": user["role"],
            "display_name": user["display_name"]
        }

    def generate_token(self, username: str, role: str) -> str:
        """Create a stateless signed session token."""
        payload = f"{username}:{role}"
        signature = hashlib.sha256((payload + self.secret_key).encode("utf-8")).hexdigest()
        return f"{username}.{role}.{signature}"

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify the signature of a session token and return user details."""
        if not token:
            return None
        
        try:
            parts = token.split(".")
            if len(parts) != 3:
                return None
            
            username, role, signature = parts
            payload = f"{username}:{role}"
            expected_sig = hashlib.sha256((payload + self.secret_key).encode("utf-8")).hexdigest()
            
            if signature != expected_sig:
                return None
                
            # Double check if user exists in the database
            users = self._load_raw_users()
            user = next((u for u in users if u["username"] == username), None)
            if not user or user["role"] != role:
                return None
                
            return {
                "username": username,
                "role": role,
                "display_name": user["display_name"]
            }
        except Exception:
            return None

    def list_users(self) -> List[Dict[str, Any]]:
        """Get all users list (for admin management). Filters out sensitive info."""
        users = self._load_raw_users()
        return [
            {
                "username": u["username"],
                "role": u["role"],
                "display_name": u["display_name"]
            } for u in users
        ]

    def delete_user(self, username: str) -> bool:
        """Delete a user account. Cannot delete super admin."""
        username = username.strip().lower()
        if username == "admin":
            raise ValueError("不能删除超级管理员账号！")

        users = self._load_raw_users()
        user_found = False
        new_users = []
        for u in users:
            if u["username"] == username:
                user_found = True
            else:
                new_users.append(u)

        if user_found:
            self._save_users(new_users)
            return True
        return False
