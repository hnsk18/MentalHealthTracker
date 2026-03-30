# SafeMind AI - Deployment Guide

Complete guide for deploying SafeMind AI to production environments.

## Table of Contents
1. [Heroku Deployment](#heroku-deployment)
2. [AWS Deployment](#aws-deployment)
3. [Azure Deployment](#azure-deployment)
4. [Docker Deployment](#docker-deployment)
5. [Self-Hosted (VPS)](#self-hosted)
6. [Database Setup](#database-setup)

---

## Heroku Deployment

### Prerequisites
- Heroku account (free tier available)
- Git installed
- Heroku CLI installed

### Step 1: Create Heroku Apps

```bash
# Create backend app
heroku create safemind-api
heroku create safemind-ui
```

### Step 2: Configure Backend

Create `Procfile` in root:
```
web: cd backend && gunicorn app:app
```

Create `runtime.txt`:
```
python-3.11.4
```

### Step 3: Set Environment Variables

```bash
heroku config:set -a safemind-api FLASK_ENV=production
heroku config:set -a safemind-api SECRET_KEY=your-secret-key
```

### Step 4: Deploy

```bash
git push heroku main:main
```

Monitor logs:
```bash
heroku logs -a safemind-api --tail
```

### Step 5: Update Frontend API URL

In `frontend/js/script.js`:
```javascript
const API_BASE = 'https://safemind-api.herokuapp.com/api';
```

---

## AWS Deployment

### Using EC2

#### Step 1: Launch EC2 Instance
- AMI: Ubuntu 20.04 LTS
- Instance Type: t2.micro (free tier)
- Security Group: Allow ports 80, 443, 5000

#### Step 2: Connect & Setup

```bash
ssh -i your-key.pem ubuntu@your-instance-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y python3-pip python3-venv nginx git

# Clone repository
git clone your-repo-url
cd MentalHealthTracker
```

#### Step 3: Setup Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Install Gunicorn
pip install gunicorn
```

#### Step 4: Configure Nginx

Create `/etc/nginx/sites-available/default`:
```nginx
server {
    listen 80 default_server;
    server_name _;

    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        alias /home/ubuntu/MentalHealthTracker/frontend/;
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo systemctl restart nginx
```

#### Step 5: Run with Systemd

Create `/etc/systemd/system/safemind.service`:
```ini
[Unit]
Description=SafeMind AI
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/MentalHealthTracker/backend
ExecStart=/home/ubuntu/MentalHealthTracker/backend/venv/bin/gunicorn app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable safemind
sudo systemctl start safemind
```

#### Step 6: SSL Certificate (Free with Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Azure Deployment

### Using Azure App Service

#### Step 1: Create Resource Group

```bash
az group create --name safemind-rg --location eastus
```

#### Step 2: Create App Service Plan

```bash
az appservice plan create \
  --name safemind-plan \
  --resource-group safemind-rg \
  --sku B1 \
  --is-linux
```

#### Step 3: Create Web App

```bash
az webapp create \
  --resource-group safemind-rg \
  --plan safemind-plan \
  --name safemind-api \
  --runtime "PYTHON|3.11"
```

#### Step 4: Configure Deployment

```bash
az webapp deployment source config-zip \
  --resource-group safemind-rg \
  --name safemind-api \
  --src deployment.zip
```

#### Step 5: Set Environment Variables

```bash
az webapp config appsettings set \
  --resource-group safemind-rg \
  --name safemind-api \
  --settings FLASK_ENV=production
```

---

## Docker Deployment

### Create Dockerfile

**backend/Dockerfile**:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]
```

**frontend/Dockerfile**:
```dockerfile
FROM node:18-alpine

WORKDIR /app

RUN npm install -g serve

COPY . .

EXPOSE 3000
CMD ["serve", "-s", ".", "-l", "3000"]
```

### Docker Compose

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - FLASK_ENV=production
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=safemind
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Deploy

```bash
docker-compose up -d
docker-compose logs -f
```

---

## Self-Hosted (VPS)

### Using DigitalOcean or Linode

#### Step 1: Create VPS
- OS: Ubuntu 20.04 LTS
- Size: Smallest available

#### Step 2: Initial Setup

```bash
# SSH into server
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Create non-root user
adduser safemind
usermod -aG sudo safemind
su - safemind
```

#### Step 3: Install Dependencies

```bash
sudo apt install -y \
  python3-pip \
  python3-venv \
  nginx \
  git \
  certbot \
  python3-certbot-nginx
```

#### Step 4: Clone and Setup

```bash
git clone your-repo-url
cd MentalHealthTracker

# Setup Python environment
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
```

#### Step 5: Configure Nginx

Put configuration files in `/etc/nginx/sites-available/`

#### Step 6: SSL Setup

```bash
sudo certbot --nginx -d yourdomain.com
```

#### Step 7: Start Services

```bash
sudo systemctl start nginx
cd ~/MentalHealthTracker/backend
gunicorn app:app
```

---

## Database Setup

### Migrate from In-Memory to PostgreSQL

#### Step 1: Install SQLAlchemy

```bash
pip install Flask-SQLAlchemy psycopg2-binary
```

#### Step 2: Update app.py

```python
from flask_sqlalchemy import SQLAlchemy

app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://user:password@localhost/safemind'
db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    email = db.Column(db.String(100), unique=True)
    password = db.Column(db.String(200))
    role = db.Column(db.String(20))

class Mood(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    mood = db.Column(db.String(20))
    timestamp = db.Column(db.DateTime)
```

#### Step 3: Initialize Database

```python
with app.app_context():
    db.create_all()
```

---

## Performance Optimization

### Frontend
- Enable gzip compression in Nginx
- Minify CSS and JavaScript
- Use CDN for static assets
- Enable browser caching

### Backend
- Use database connection pooling
- Implement Redis caching
- Add request caching headers
- Use async tasks with Celery

### Nginx Configuration

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript;

client_max_body_size 20M;

# Cache static assets
location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
    expires 365d;
    add_header Cache-Control "public, immutable";
}
```

---

## Monitoring & Logging

### Application Logging

```python
import logging
from logging.handlers import RotatingFileHandler

if not app.debug:
    file_handler = RotatingFileHandler('logs/app.log', maxBytes=10240000, backupCount=10)
    file_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s'))
    app.logger.addHandler(file_handler)
```

### Error Tracking

Use Sentry:
```bash
pip install sentry-sdk
```

```python
import sentry_sdk
sentry_sdk.init(
    dsn="your-sentry-dsn",
    traces_sample_rate=1.0
)
```

---

## Scaling Strategies

### Horizontal Scaling
- Use load balancer (AWS ELB, nginx)
- Deploy multiple application instances
- Use managed database (RDS, CloudSQL)

### Vertical Scaling
- Increase server resources
- Optimize database indexes
- Cache frequently accessed data

### Database Scaling
- Enable read replicas
- Use database clustering
- Implement sharding for large datasets

---

## Backup & Recovery

### Database Backups

```bash
# PostgreSQL daily backup
0 2 * * * pg_dump safemind > /backups/safemind_$(date +\%Y\%m\%d).sql

# Upload to S3
aws s3 cp /backups/safemind_*.sql s3://your-bucket/backups/
```

### Application Backups

```bash
# Backup configuration
tar -czf app_backup_$(date +%Y%m%d).tar.gz /home/safemind/MentalHealthTracker
```

---

## Security Checklist

- [ ] Use HTTPS/SSL certificates
- [ ] Set strong database passwords
- [ ] Enable firewall rules
- [ ] Use environment variables for secrets
- [ ] Enable CORS carefully
- [ ] Add rate limiting
- [ ] Implement user input validation
- [ ] Use prepared statements for queries
- [ ] Enable security headers
- [ ] Regular security updates

---

## Maintenance

### Regular Tasks
- Monitor error logs
- Check disk space
- Update dependencies monthly
- Review user analytics
- Backup data daily

### Uptime Monitoring
- Use Uptime Robot (free)
- Health check endpoints
- Email alerts on downtime

---

## Cost Estimation

### Monthly Costs (Approximate)
- Heroku: $7-50
- AWS: $5-20 (t2.micro free tier)
- DigitalOcean: $5-25
- Azure: $10-30
- Database: $0-15

---

**Need help? Check the main README.md or API_DOCS.md**

Last Updated: March 2026
