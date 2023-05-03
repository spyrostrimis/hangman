import axios from 'axios';
import { useState } from "react";

function Hello() {
    const [data, setData] = useState("")

    async function helloserver() {
        let response = await axios.get("http://localhost:8000/")
        console.log(response);
        setData(response.data)
    }

    

    return (
      <>
        {" "}
        Getting sth from the server:{" "}
            <button onClick={helloserver}>Click</button>
            <br />
            <div>{data}</div>
      </>
    );
}

export default Hello;