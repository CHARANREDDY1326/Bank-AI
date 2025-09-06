import os
import json
import boto3
from langchain_aws import BedrockLLM
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_community.document_loaders import JSONLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.prompts import PromptTemplate
from langchain.chains import create_retrieval_chain 
from langchain.chains.combine_documents import create_stuff_documents_chain

# Configuration
chroma_dir = "chromaVectorStore"
persist_dir = "chromaVectorStore"

class BedrockTitanEmbeddings(Embeddings):
    def __init__(self, region_name="us-east-1"):
        try:
            self.client = boto3.client("bedrock-runtime", region_name=region_name)
            self.model_id = "amazon.titan-embed-text-v2:0"
        except Exception as e:
            print(f"❌ Error initializing Bedrock client: {e}")
            raise
    
    def embed_documents(self, texts):
        return [self.embed(t) for t in texts]
    
    def embed_query(self, text):
        return self.embed(text)
    
    def embed(self, text):
        try:
            request = json.dumps({"inputText": text[:8000]})  # Limit text length
            response = self.client.invoke_model(modelId=self.model_id, body=request)
            model_response = json.loads(response["body"].read())
            return model_response["embedding"]
        except Exception as e:
            print(f"❌ Error in embedding: {e}")
            return [0.0] * 1024  # Return zero vector as fallback

def generate_suggestion(intent: str, query: str) -> str:
    """Generate suggestion using RAG"""
    try:
        # Setup vector store
        embeddings = BedrockTitanEmbeddings(region_name="us-east-1") 
        vectorstore = Chroma(
            persist_directory=persist_dir,
            embedding_function= embeddings
        )
        retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
        
        # Initialize LLM
        llm = BedrockLLM(
            model_id="mistral.mistral-large-2402-v1:0",
            client=boto3.client("bedrock-runtime", region_name="us-east-1"),
            model_kwargs={
                "temperature": 0.1,
                "max_tokens": 512
            }
        )
        
        # Fixed prompt template
        prompt = """
You are an assistant for customer service of a fictional bank called Bank-AI.

Use the following retrieved context to help the customer service expert answer the customer's question:
- Speak like a digital assistant guiding the user through Bank-AI's website or app.
- Use terms like "click", "select", "enter account number", etc.
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
        
        # Fixed input variables
        sanitized_template = PromptTemplate(
            input_variables=['context', 'input'],  # Fixed variable names
            template=prompt,
        ) 

        # Create chains
        rag_chain = create_stuff_documents_chain(
            llm=llm,
            prompt=sanitized_template,
        )
        
        full_rag = create_retrieval_chain(
            retriever=retriever,
            combine_docs_chain=rag_chain,
        )

        # Generate response
        response = full_rag.invoke({'input': query})
        return response.get('answer', 'I apologize, but I could not generate a helpful response.')
        
    except Exception as e:
        print(f"❌ Error generating suggestion: {e}")
        return f"I apologize, but I'm experiencing technical difficulties. Please contact customer support directly for assistance with: {query}"

# Test function
def test_suggestion():
    """Test the suggestion generation"""
    try:
        intent = "balance_inquiry"
        query = "How do I check my account balance?"
        result = generate_suggestion(intent, query)
        print(f"Intent: {intent}")
        print(f"Query: {query}")
        print(f"Suggestion: {result}")
        return True
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing suggestion generation...")
    test_suggestion()