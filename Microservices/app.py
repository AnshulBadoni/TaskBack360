from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Python microservice running"}

@app.get("/process")
def process_data(data: str):
    return {"processed_data": data.upper()}

if __name__ == "__main__":
    uvicorn.run(app,  port=5001)
