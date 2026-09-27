import React from 'react'
import { useState, useEffect } from "react";
import { Typewriter } from "react-simple-typewriter";
import { useAuth } from './AuthProvider';

const Wordfacts = ({
  Loser = false,
  Winner = false,
  innertext,
  setWordfacts,
}) => {
  // const instructions = (
  //   <>
  //     <p>Your goal is to find the hidden word.</p>
  //     <p>
  //       You will be presented with a number of blank spaces representing the
  //       missing letters you need to find.
  //     </p>
  //     <p>
  //       Use your keyboard to guess a letter or just click it. To help you on
  //       your journey, here are a few tips:
  //     </p>
  //   </>
  // );

  // const [innertext, setInnertext] = useState();

  const { user } = useAuth();

  useEffect(() => {
    if (Winner || Loser) {
      setWordfacts();
    }
  }, [Loser, Winner]);

  return (
    <div className="wordfactscontainer">
      <div className="wordfactscontainerinner">
        <div>
          {innertext ? (
            innertext
          ) : (
            <h5>
              {/* Style will be inherited from the parent element */}
              <Typewriter
                words={[
                  `Artsy has shut down! Can you bring him back to life ${
                    user ? user.username : ""
                  }?`,
                  `You only have 6 attempts...`,
                ]}
                typeSpeed={35}
                deleteSpeed={0}
                delaySpeed={1200}
              />
            </h5>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wordfacts
