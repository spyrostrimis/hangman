const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
require("dotenv").config();
const Word = require("../Models/wordmodel")
const { Configuration, OpenAIApi } = require("openai");
// import { Configuration, OpenAIApi } from "openai";
const axios = require("axios");
const fs = require("fs");

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.GPT_KEY,
  })
);

router.get("/word/random", async (req, res) => {
  try {
    const resword = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      temperature: 2,
      messages: [
        {
          role: "system",
          content:
            "You are English Literature ProfessorGPT helpful assistant teacher of english language and culture",
        },
        {
          role: "user",
          content:
            "Give 1 word that we don't encounter frequently in everyday life, but we do find it in classic English literature, poetry, philosophy. Most people don't know what this word means or how it is spelled. Respond only with 1 word and nothing else, no spaces no dots or full stops no symbols. Just one word. Please take into account that your answer will be saved as is to my Mongo Database, please make it lowercase with only a-z characters",
        },
      ],
    });
    const word = resword.data.choices[0].message.content;
    // console.log("Word:", word);
    // console.log("Response:", response);
    // return res.json({ msg: "Responded successfully.", word });

    const resdefinition = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are English Literature ProfessorGPT helpful assistant teacher of english language and culture",
        },
        {
          role: "user",
          content: `Give the definition of the word ${word}. Respond immediately with the definition and nothing else, without repeating the word`,
        },
      ],
    });
    const definition = resdefinition.data.choices[0].message.content;
    // console.log(definition);

    const resexample = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are English Literature ProfessorGPT helpful assistant teacher of english language and culture",
        },
        {
          role: "user",
          content: `Provide one sentence that includes this specific word ${word} from English or American literature, poetry, philosophy, politics, or culture , clearly mentioning the word ${word} itself. Then where it was used (optional), from whom (optional) and when (optional). If you can't find such a sentence return There is not an example for this word.`,
        },
      ],
    });
    const example = resexample.data.choices[0].message.content;
    console.log(example);

    const resexplain = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are English Literature ProfessorGPT helpful assistant teacher of english language and culture",
        },
        {
          role: "user",
          content: `Explain this sentence ${example} and particularly what this word ${word} means inside that sentence`,
        },
      ],
    });
    const explanation = resexplain.data.choices[0].message.content;
    // console.log(explanation);
    //image
    //   const image = await openai.createImage({
    //     prompt: `An abstract painting of: ${word}`,
    //     n: 1,
    //     size: "1024x1024",
    //   });

    // console.log(image.data);
    
    // const image2 = await openai.createImage({
    //   prompt: `An abstract oil painting of: ${example}`,
    //   n: 1,
    //   size: "1024x1024",
    // });

    // console.log(image2.data);
    //
    let wordFound = await Word.findOne({ word });
    // console.log(wordFound);
    if (wordFound) {
      return res.send({ msg: "Word already exists", wordFound });
    } else {
      let newWord = await Word.create({
        word,
        definition,
        example,
        explanation,
      });
      return res.send({ msg: "Word added successfully!", newWord });
    }
    // return res.json({
    //   msg: "Responded successfully.",
    //   word,
    //   definition,
    //   example,
    //   explanation,

    // });


  } catch (error) {
    res.status(500).json({ msg: "No response", error });
  }

});

router.get("/word/get-all-words-create-random", async (req, res) => {
  const allwords = await Word.find();
  res.send(allwords);
  //create new word with gpt
  try {
    const resword = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      temperature: 2,
      messages: [
        {
          role: "system",
          content:
            "You are English Literature ProfessorGPT helpful assistant teacher of english language and culture",
        },
        {
          role: "user",
          content:
            "Give 1 word that we don't encounter frequently in everyday life, but we do find it in classic English literature, poetry, philosophy. Most people don't know what this word means or how it is spelled. Respond only with 1 word and nothing else, no spaces no dots or full stops no symbols. Just one word. Please take into account that your answer will be saved as is to my Mongo Database, please make it lowercase with only a-z characters",
        },
      ],
    });
    const word = resword.data.choices[0].message.content;
    console.log("Word:", word);
    // console.log("Response:", response);
    // return res.json({ msg: "Responded successfully.", word });

    const resdefinition = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are English Literature ProfessorGPT helpful assistant teacher of english language and culture",
        },
        {
          role: "user",
          content: `Give the definition of the word ${word}. Respond immediately with the definition and nothing else, without repeating the word`,
        },
      ],
    });
    const definition = resdefinition.data.choices[0].message.content;
    console.log("Def:", definition);

    const resexample = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are English Literature ProfessorGPT helpful assistant teacher of english language and culture",
        },
        {
          role: "user",
          content: `Provide one sentence that includes this specific word ${word} from English or American literature, poetry, philosophy, politics, or culture , clearly mentioning the word ${word} itself. Then where it was used (optional), from whom (optional) and when (optional). If you can't find such a sentence return There is not an example for this word.`,
        },
      ],
    });
    const example = resexample.data.choices[0].message.content;
    console.log("example ok!");

    const resexplain = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are English Literature ProfessorGPT helpful assistant teacher of english language and culture",
        },
        {
          role: "user",
          content: `Explain this sentence ${example} and particularly what this word ${word} means inside that sentence. If there is no ${example} for this word then return an empty string`,
        },
      ],
    });
    const explanation = resexplain.data.choices[0].message.content;
    console.log("explanation ok!");
    const ressynonym = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      temperature: 2,
      messages: [
        {
          role: "system",
          content:
            "You are an English Literature ProfessorGPT helpful assistant teacher of english language and culture",
        },
        {
          role: "user",
          content: `Give one synonym for the word ${word}. Respond only with 1 synonym and nothing else, no spaces no dots or full stops no symbols. Just one word. Please take into account that your answer will be saved as is to my Mongo Database, please make it lowercase with only a-z characters`,
        },
      ],
    });
    const synonym = ressynonym.data.choices[0].message.content;
    console.log(synonym);

    // MERRIAM-WEBSTER'S API

    const resmw = await axios.get(
      `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${word}?key=${process.env.MW_KEY}`
    );
    // console.log(resmw.data);
    let ipa = "";
    let sound = "";
    let shortdef = "";
    if (resmw) {
      if (resmw.data[0].hwi.prs[0].mw) {
         ipa = resmw.data[0].hwi.prs[0].mw;
      }
      if (resmw.data[0].hwi.prs[0].sound.audio) {
const soundtitle = resmw.data[0].hwi.prs[0].sound.audio;
 sound = `https://media.merriam-webster.com/audio/prons/en/us/mp3/${soundtitle[0]}/${soundtitle}.mp3`;
      }
      if (resmw.data[0].shortdef[0]) {
         shortdef = resmw.data[0].shortdef[0];
      }
      
      
    }
    
    console.log(ipa);
    
    console.log(sound);
    
      console.log(shortdef);


    //image
      const resimage = await openai.createImage({
        prompt: `An abstract painting of: ${word}`,
        n: 1,
        size: "512x512",
      });

    // console.log(resimage.data.data[0].url);
    let imageBuffer = "";
    if (resimage) {
      const imageUrl = resimage.data.data[0].url;
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      imageBuffer = Buffer.from(imageResponse.data, "binary");
    }

    // const image2 = await openai.createImage({
    //   prompt: `An abstract oil painting of: ${example}`,
    //   n: 1,
    //   size: "1024x1024",
    // });

    // console.log(image2.data);
    //
    let wordFound = await Word.findOne({ word });
    // console.log(wordFound);
    if (wordFound) {
      // return res.send({ msg: "Word already exists", wordFound });
      console.log("Word already exists:", wordFound.word);
    } else {
      let newWord = await Word.create({
        word,
        definition,
        shortdef,
        example,
        explanation,
        synonym,
        ipa,
        sound,
        image: imageBuffer,
      });
      // return res.send({ msg: "Word added successfully!", newWord });
      console.log("New word added successfully!", newWord.word);
    }
    // return res.json({
    //   msg: "Responded successfully.",
    //   word,
    //   definition,
    //   example,
    //   explanation,

    // });
  } catch (error) {
    res.status(500).json({ msg: "No response", error });
  }
  //

    
})

router.get("/word/get-all-words", async (req, res) => {
  const allwords = await Word.find();
  res.send(allwords);
});

router.get("/word/get-mw-api", async (req, res) => {
  try {
    // const allwords = await Word.find();
    // let searchword = allwords[Math.floor(Math.random() * allwords.length)].word;
    let searchword = "russet";
    const response = await axios.get(
      `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${searchword}?key=${process.env.MW_KEY}`
    );
    const searchData = response.data;
    console.log(response.data[0].hwi);
    console.log(response.data[0].hwi.prs[0].mw);
    console.log(response.data[0].hwi.prs[0].sound.audio);
    console.log(response.data[0].shortdef[0]);
    // console.log(response.data[0].syns);
    // if (response.data[0].syns) {
    //     console.log(response.data[0].syns[0].pt[0][1]);
    // }
      res.send(searchData);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});


// MERRIAM-WEBSTER'S COLLEGIATE® THESAURUS
router.get("/word/get-mw-thes", async (req, res) => {
  try {
    const allwords = await Word.find();
    let searchword = allwords[Math.floor(Math.random() * allwords.length)].word;
    const response = await axios.get(
      `https://www.dictionaryapi.com/api/v3/references/thesaurus/json/${searchword}?key=${process.env.MW_KEY_THESAURUS}`
    );
    const searchData = response.data;
    
    console.log(response);
    // console.log(response.data[0].hwi);
    // console.log(response.data[0].hwi.prs[0].mw);
    // console.log(response.data[0].hwi.prs[0].sound.audio);
    console.log(searchword);
    res.send(searchData);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});


router.get("/word/get-free-api", async (req, res) => {
  try {
    const allwords = await Word.find();
    let searchword = allwords[Math.floor(Math.random() * allwords.length)].word;
    const response = await axios.get(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${searchword}`
    );
    const searchData = response.data;

    res.send(searchData);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;

  //   openai
  //     .createChatCompletion({
  //       model: "gpt-3.5-turbo",
  //       messages: [
  //         {
  //           role: "system",
  //           content:
  //             "You are English Literature ProfessorGPT helpful assistant teacher of english language and culture",
  //         },
  //         {
  //           role: "user",
  //           content: `Give the definition of the word ${word}. Respond immediately with the definition and nothing else.`,
  //         },
  //       ],
  //     })
  //     .then((res) => {
  //       const definition = res.data.choices[0].message.content;
  //       console.log("Definition:", definition);
  //       // Store the word and definition in your MongoDB database
  //     });
  // });






