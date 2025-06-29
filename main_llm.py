import os
import json
import re
import boto3
from langchain_aws  import BedrockLLM
from langchain.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_community.document_loaders import JSONLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.prompts import PromptTemplate
from langchain.chains import create_retrieval_chain 
from langchain.chains.combine_documents import create_stuff_documents_chain

path = "ragged jsons"
chroma_dir = "chromaVectorStore"
persist_dir = "chromaVectorStore"
all_docs  = []

class BedrockTitanEmbeddings(Embeddings):
    def __init__(self, region_name="us-east-1"):
        self.client = boto3.client("bedrock-runtime",region_name=region_name)
        self.model_id = "amazon.titan-embed-text-v2:0"
    
    def embed_documents(self, texts):
        return [self.embed(t) for t in texts]
    
    def embed_query(self, text):
        return self.embed(text)
    
    def embed(self, text):
        request = json.dumps({"inputText": text})
        response = self.client.invoke_model(modelId=self.model_id, body=request)
        model_response = json.loads(response["body"].read())
        return model_response["embedding"]

def generate_suggestion(intent: str, query: str)-> str:
    embeddings = BedrockTitanEmbeddings(region_name="us-east-1") 
    vectorstore = Chroma(
        persist_directory=persist_dir,
        embedding_function= embeddings
    )
    retriever = vectorstore.as_retriever()
    llm = BedrockLLM(
        model_id = "mistral.mistral-large-2402-v1:0", 
        #"arn:aws:bedrock:us-east-1:014498665615:inference-profile/us.meta.llama4-maverick-17b-instruct-v1:0",
        client = boto3.client("bedrock-runtime",region_name="us-east-1"),
        #model_provider="meta"
    )
    prompt = """
        You are an assistant for customer service of a fictional bank called Bank-AI.

        Use the following retrieved context to help the customer service expert answer the customer's question:
        - Speak like a digital assistant guiding the user through Bank-AI's website or app.
        - Use terms like “click”, “select”, “enter account number”, etc.
        - Never repeat the same instruction more than once.
        - Never copy the same line or step again.
        - If there are multiple UI terms for the same action (e.g., 'Check Status' and 'Know Status'), pick one.
        - If the answer has more than 2 steps, format them as a numbered list.
        - ✅ DO NOT include the source text or reference section. Only respond with the actual helpful answer.
        - Be brief, clear, and professional.

        Context:
        {context}

        Question:
        {input}

        Answer:
    """
    sanitized_template = PromptTemplate(
        input_variables=['context','question'],
        template=prompt,
    ) 

    rag_chain = create_stuff_documents_chain(
        llm=llm,
        prompt = sanitized_template,
    )
    full_rag = create_retrieval_chain(
        retriever = retriever,
        combine_docs_chain = rag_chain,
    )

    response = full_rag.invoke({'input':query})
    return response['answer']