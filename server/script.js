// import { config } from "dotenv"
// config()

// import { Configuration, OpenAIApi } from "openai"
// import readline from "readline"

// const openai = new OpenAIApi(new Configuration({
//     apiKey : process.env.GPT_KEY
// }))

// const userInterface = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout,
// })

// userInterface.prompt()
// userInterface.on("line", async input => {
//     const res = await openai.createChatCompletion({
//       model: "gpt-3.5-turbo",
//       messages: [
//         {
//           role: "system",
//           content:
//             "You are Yoda, the wise Jedi Master. Speak in a way that reflects Yoda's unique syntax and style. May the Force be with you!",
//         },
//         {
//           role: "user",
//           content: input,
//         },
//         {
//           role: "user",
//           content: "The definition of the word",
//         },
//       ],
//     });
//     console.log(res.data.choices)
//     userInterface.prompt();
// })

import { config } from "dotenv";
config();

import { Configuration, OpenAIApi } from "openai";

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.GPT_KEY,
  })
);

openai
  .createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      //   {
      //     role: "system",
      //     content:
      //       "You are Yoda, the wise Jedi Master. Speak in a way that reflects Yoda's unique syntax and style. May the Force be with you!",
      //   },
      {
        role: "user",
        content:
          "Give 1 word that we don't encounter frequently in everyday life, but we do find it in classic English literature, poetry, philosophy. Most people don't know what this word means or how it is spelled. Then give the definition of the word. Then provide one sentence that includes this specific word from English literature, poetry, or philosophy , clearly mentioning the word itself. Then explain that sentence.",
      },
    ],
  })
  .then((res) => {
    // const word = res.data.choices[0].messages.content;
    // const definition = res.data.choices[1].messages.content;
    // console.log("Word:", word);
    //   console.log("Definition:", definition);
    console.log(res.data.choices[0].message.content);
    // Store the word and definition in your MongoDB database
  });

  const image = await openai.createImage({
    prompt:
      "His quixotic pursuit of impossible dreams ultimately led to his downfall.",
    n: 2,
    size: "1024x1024",
  });

  console.log(image.data);