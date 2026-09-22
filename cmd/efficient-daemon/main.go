package main

import (
	"efficient-daemon/internal/core"
)

type BotResponse struct {
	Response string `json:"response" jsonschema_description:"The bot's response"`
	Reason   string `json:"reason" jsonschema_description:"Why the bot responded with the response"`
	Success  bool   `json:"success" jsonschema_description:"Bot was able to answer the user request or not"`
}

func main() {
	botContext := core.NewSimpleBotContext(
		"just respond with no verbosity. do not blab about anything. straight to the point.",
		"say 'this is a test'",
	)

	resp, err := core.Ask[BotResponse](botContext)
	if err != nil {
		panic(err)
	}

	println(resp.Success)
	println(resp.Reason)
	println(resp.Response)
}
