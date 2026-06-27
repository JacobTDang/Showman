package main

import (
	"log"
	"net/http"
	"os"

	"showman/controlplane/gateway"
)

func main() {
	cfg := gateway.ConfigFromEnv()
	gw := gateway.New(cfg)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port
	log.Printf("[showman] gateway listening on %s (worker=%s coordinator=%s)", addr, cfg.WorkerURL, cfg.CoordinatorURL)
	log.Fatal(http.ListenAndServe(addr, gw))
}
