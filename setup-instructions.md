# Инструкция по установке и запуску системы классификации изображений

## Структура проекта
```
image-classifier/
├── backend/
│   ├── app.py
│   ├── vision_process.py
│   └── requirements.txt
├── frontend/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       └── ImageClassifier.jsx
│   └── public/
└── dataset/
    └── [категории с изображениями]
```

## 1. Установка бэкенда

1. Создайте и активируйте виртуальное окружение Python:
```bash
python -m venv venv
source venv/bin/activate  # для Linux/Mac
# или
.\venv\Scripts\activate  # для Windows
```

2. Установите зависимости бэкенда:
```bash
cd backend
pip install -r requirements.txt
```

3. Содержимое `requirements.txt`:
```
fastapi
uvicorn
python-multipart
pillow
torch
transformers
tqdm
```

4. Скопируйте предоставленный код бэкенда в файл `app.py`

## 2. Установка фронтенда

1. Создайте новый React проект:
```bash
npx create-react-app frontend
cd frontend
```

2. Установите необходимые зависимости:
```bash
npm install -D tailwindcss postcss autoprefixer
npm install lucide-react @/components/ui/alert
npm install lucide-react
```

3. Инициализируйте Tailwind CSS:
```bash
npx tailwindcss init -p
```

4. Настройте `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

5. Добавьте директивы Tailwind в `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

6. Создайте компонент ImageClassifier, скопировав предоставленный код в `src/components/ImageClassifier.jsx`

7. Обновите `src/App.jsx`:
```jsx
import ImageClassifier from './components/ImageClassifier';

function App() {
  return (
    <div className="App">
      <ImageClassifier />
    </div>
  );
}

export default App;
```

## 3. Настройка CORS

В файл `backend/app.py` добавьте настройку CORS:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 4. Запуск системы

1. Запустите бэкенд:
```bash
cd backend
uvicorn app:app --reload
```
Бэкенд будет доступен по адресу: http://localhost:8000

2. В другом терминале запустите фронтенд:
```bash
cd frontend
npm start
```
Фронтенд будет доступен по адресу: http://localhost:3000

## 5. Использование системы

1. Откройте браузер и перейдите по адресу http://localhost:3000

2. Загрузите изображения одним из способов:
   - Перетащите файлы в область загрузки
   - Нажмите на область загрузки и выберите файлы

3. Нажмите кнопку "Process Images" для начала обработки

4. После обработки всех изображений:
   - Просмотрите результаты на странице
   - Скачайте CSV-файл с результатами, нажав "Download CSV"

## Возможные проблемы и решения

1. Если бэкенд не запускается:
   - Проверьте, что все зависимости установлены
   - Убедитесь, что порт 8000 свободен
   - Проверьте наличие всех необходимых файлов

2. Если фронтенд не запускается:
   - Проверьте версию Node.js (рекомендуется 14+)
   - Убедитесь, что все зависимости установлены
   - Проверьте, что порт 3000 свободен

3. Если не работает загрузка изображений:
   - Проверьте консоль браузера на наличие ошибок
   - Убедитесь, что бэкенд запущен и доступен
   - Проверьте настройки CORS

## Дополнительные настройки

1. Изменение порта бэкенда:
```bash
uvicorn app:app --reload --port 8080
```
Не забудьте обновить URL в компоненте ImageClassifier

2. Изменение порта фронтенда:
```bash
PORT=3001 npm start
```
Не забудьте обновить настройки CORS в бэкенде

## Рекомендации по использованию

1. Оптимальный размер изображений: до 1920x1080 пикселей

2. Поддерживаемые форматы: .jpg, .jpeg, .png

3. Рекомендуется загружать не более 10 изображений одновременно для оптимальной производительности
