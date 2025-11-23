# My Python App

This project serves as a Docker bootstrap for any Python application. It includes a Dockerfile, docker-compose configuration, and example environment files to get you started quickly.

## Project Structure

bqtopsql_dim_restaurant_product_all/
│
├── src/
│   ├── main.py
│   ├── config/
│   │   └── settings.py
│   ├── models/
│   │   └── data_models.py
│   ├── services/
│   │   ├── bigquery_service.py
│   │   ├── database_service.py
│   │   └── storage_service.py
│   └── utils/
│       ├── log_manager.py
│       └── file_utils.py
├── append_files/
├── requirements.txt
├── .env
└── README.md

## Prerequisites

- Docker
- Docker Compose
- Python 3.11.6 (for local development)
- Visual Studio Code (optional, for development and debugging)

## Setup

1. **Clone the repository**:
   ```sh
   git clone https://your-username@bitbucket.org/gregario-app/docker-bootstrap.git
   cd docker-bootstrap

2. **Create environment files**:

    Copy the example environment files to create your own .env and docker.env files.
        cp .env-example .env
        cp docker.env-example docker.env

    Fill in the environment variables:
        Open .env and docker.env files and fill in the required values.

3. **Obtain application_credentials.json**:

    You need an appropriate application_credentials.json file to run this application. This file contains your Google Cloud service account credentials and should be placed in the root directory of the project. Do not include this file in the repository. You can obtain this file from your Google Cloud Console.

4. **Docker Instructions**

    1. **Build the Docker Image**
    To build the Docker image, run the following command:
        docker-compose build

    2. **Run the Docker Container**
    To run the Docker container, use the following command:
        docker-compose up

    3. **Stop the Docker Container**
    To stop the Docker container, press Ctrl+C in the terminal where docker-compose up is running, or run:
        docker-compose down

5. **Local Development**
    Install Dependencies
        If you prefer to run the application locally without Docker, follow these steps:

    1. Create a virtual environment with needed python version (3.11 as example):
        py -3.13 -m venv .venv

    2. Activate the virtual environment:
        On Windows:
            .venv\Scripts\activate
        On macOS/Linux:
            source .venv/bin/activate

    3. Upgrade pip to latest version available and install the dependencies:
        *\.venv\Scripts\python.exe -m pip install --upgrade pip -r requirements.txt

6. **Run the Application**
    To run the application locally, use the following command:
        python -m src.main

7. **Debugging in VSCode**
    1. Open the project in VSCode.
    2. Ensure you have the Python extension installed.
    3. Open the src/main.py file.
    4. Press F5 to start debugging.

8. **Notes**
    - Ensure that the GOOGLE_APPLICATION_CREDENTIALS environment variable is correctly set in the docker.env file for production environments.
    - Adjust the requirements.txt file to include any additional dependencies your application may need.

# INSTRUCCIONES PARA SUBIR SUBIR EL BUILD Y EJECUTAR CLOUDRUN   

# Tener instalada en el equipo el CLI de google en el equipo local para actualizar la imagen de docker

    https://cloud-google-com.translate.goog/sdk/docs/install?_x_tr_sl=en&_x_tr_tl=es&_x_tr_hl=es&_x_tr_pto=tc

# Tener docker instalado
    https://docs.docker.com/desktop/

# Una vez instalado docker y gci correr este comando en latermnal cmd
    gcloud auth configure-docker us-central1-docker.pkg.dev

# Actualizacion de imagen docker para GCP CloudRun Job ()
# URL de artifact: 
    https://console.cloud.google.com/artifacts/docker/pimvault-293221/us-central1/bqtopsql-dim-restaurant-product-all?authuser=1&project=pimvault-293221
# URL de CloudRun Job:  
    pendiente hasta tener arriba el artifact

# El CloudRun Job está configurado para correr siempre el TAG "latest"

# 1. Hacer un build desde el ultimo commit (u otro) de la rama master, agregando el tag latest
    docker build -t bqtopsql-dim-restaurant-product-all .
# 2. Crear un nuevo tag en el repo a partir de latest con la versión definida en el último update. X ej:
    docker tag bqtopsql-dim-restaurant-product-all us-central1-docker.pkg.dev/pimvault-293221/bqtopsql-dim-restaurant-product-all/bqtopsql-dim-restaurant-product-all:v1.0.0
# 3. Subir al repo la versión definida en el último update.
    docker push us-central1-docker.pkg.dev/pimvault-293221/bqtopsql-dim-restaurant-product-all/bqtopsql-dim-restaurant-product-all:v1.0.0
# 4. Actualizar el tag latest del repo a partir de la nueva versión creada
    docker tag bqtopsql-dim-restaurant-product-all:latest us-central1-docker.pkg.dev/pimvault-293221/bqtopsql-dim-restaurant-product-all/bqtopsql-dim-restaurant-product-all:latest
# 5. Subir el tag latest a la última versión subida y compilada
    docker push us-central1-docker.pkg.dev/pimvault-293221/bqtopsql-dim-restaurant-product-all/bqtopsql-dim-restaurant-product-all:latest

# PROBAR EL JOB EN LOCAL

# 1. Hacer un build desde el ultimo commit (u otro) de la rama master, agregando el tag latest
    docker build -t bqtopsql-dim-restaurant-product-all .
# 2. Realizar una ejecución local del job, cargando a su vez las variables de entorno necesarias para el job
    docker run --rm --env-file docker.env bqtopsql-dim-restaurant-product-all
