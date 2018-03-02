#!/bin/bash
docker build -t rilleralle/k8s-graph:develop ../.
docker login -u "$DOCKER_USERNAME" -p "$DOCKER_PASSWORD";
docker push rilleralle/k8s-graph:develop