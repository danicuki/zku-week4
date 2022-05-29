import detectEthereumProvider from "@metamask/detect-provider"
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import { providers, utils } from "ethers"
import Head from "next/head"
import React, { useEffect } from "react"
import styles from "../styles/Home.module.css"
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from "yup";
import Greeter from "artifacts/contracts/Greeters.sol/Greeters.json"
import { Contract } from "ethers"

export default function Home() {
    const [logs, setLogs] = React.useState("Connect your wallet and greet!")
    const [greets, setGreets] = React.useState([] as Array<string>)
    const [greeting, setGreeting] = React.useState("Hello World")


    useEffect(() => {
        const provider2 = new providers.JsonRpcProvider("http://localhost:8545")
        const contract = new Contract("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", Greeter.abi, provider2.getSigner())

        contract.on("NewGreeting", (c) => {
            const greet = utils.parseBytes32String(c)
            console.log("Received Greeting " + greet);
            setGreets((oldGreets) => [...oldGreets, greet]);
        })
    }, [])

    async function greet() {
        setLogs("Creating your Semaphore identity...")

        const provider = (await detectEthereumProvider()) as any
        await provider.request({ method: "eth_requestAccounts" })

        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage("Sign this message to create your identity!")

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        setLogs("Creating your Semaphore proof...")

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
            greeting
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof)

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status === 500) {
            const errorMessage = await response.text()

            setLogs(errorMessage)
        } else {
            console.log(await response.json())
            setLogs("Your anonymous greeting is onchain :)")
        }
    }

    const schema = yup.object({
        name: yup.string().required(),
        age: yup.number().positive().integer().required(),
        address: yup.string().matches(/^0x[a-f0-9]{40}$/i).required(),
    }).required();

    const { register, handleSubmit, formState: { errors } } = useForm(
        { resolver: yupResolver(schema) }
    );
    const onSubmit = (data: any) => {
        console.log(data)
    }

    return (
        <div className={styles.container}>
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={styles.main}>
                <h1 className={styles.title}>Greetings</h1>

                <p className={styles.description}>Send your greetings here. One greet per account!</p>

                <div className={styles.logs}>{logs}</div>

                <div id="greetBox">
                    <input type="text" placeholder="Your Greet text here" value={greeting} onChange={(t) => { setGreeting(t.target.value) }} />
                    <button onClick={() => greet()} className={styles.button}>
                        Greet
                    </button>

                    <h2>Greets</h2>
                    {greets.length === 0 && (
                        <p>Greets list is empty</p>
                    )}
                    <ul>
                        {greets.map((g, i) => {
                            return (<li key={"g" + i}>{g}</li>)
                        })}
                    </ul>
                </div>

                <form onSubmit={handleSubmit(onSubmit)}>
                    <input id="name" type="text" placeholder="Name" {...register("name")} />
                    <p>{errors.name?.message}</p>

                    <input id="number" type="number" placeholder="Age" {...register("age")} />
                    <p>{errors.age?.message}</p>
                    <input id="address" type="text" placeholder="Address" {...register("address")} />
                    <p>{errors.address?.message}</p>
                    <input type="submit" id="form_submit" className={styles.button} />
                </form>
            </main>
        </div>
    )
}
